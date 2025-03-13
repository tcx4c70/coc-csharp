import * as fs from 'fs';
import * as cp from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as uuid from 'uuid';

import {
  LanguageClientOptions,
  LanguageClient,
  ServerOptions,
  MessageTransports,
  ExtensionContext,
  State,
  Uri,
  DocumentSelector,
  ProtocolRequestType,
  RequestType,
  RequestType0,
  ResponseError,
  CancellationError,
  commands,
  services,
  window,
  workspace,
} from 'coc.nvim';
import { DotnetResolver } from 'coc-utils';
import {
  RAL,
  SocketMessageReader,
  SocketMessageWriter,
  CancellationToken,
  PartialResultParams,
} from 'vscode-languageserver-protocol/node';
import { NamedPipeInformation } from './roslynProtocol';
import * as RoslynProtocol from './roslynProtocol';
import { AzureDevOpsPackageDownloader, RoslynLanguageServerPackage } from './downloader';
import { UriConverter } from './uriConverter';
import {
  readConfigurations,
  provideHover,
  resolveCompletionItem,
  provideDocumentSemanticTokens,
  provideDocumentRangeSemanticTokens,
} from './middleware';

export class RoslynLanguageServer {
  /**
   * The regular expression used to find the named pipe key in the LSP server's stdout stream.
   */
  private static readonly namedPipeKeyRegex = /{"pipeName":"[^"]+"}/;

  /**
   * The solution file previously opened; we hold onto this so we can send this back over if the server were to be relaunched for any reason, like some other configuration
   * change that required the server to restart, or some other catastrophic failure that completely took down the process. In the case that the process is crashing because
   * of trying to load this solution file, we'll rely on VS Code's support to eventually stop relaunching the LSP server entirely.
   */
  private _solutionFile: Uri | undefined;

  /** The project files previously opened; we hold onto this for the same reason as _solutionFile. */
  private _projectFiles: Uri[] = new Array<Uri>();

  constructor(
    private _languageClient: LanguageClient,
    private _context: ExtensionContext,
  ) {
    this.registerSendOpenSolution();
  }

  public get client(): LanguageClient {
    return this._languageClient;
  }

  /**
   * Returns whether or not the underlying LSP server is running or not.
   */
  public isRunning(): boolean {
    return this._languageClient.getPublicState() === State.Running;
  }

  public async restart(): Promise<void> {
    this._languageClient.restart();
  }

  /**
   * Makes an LSP request to the server with a given type and parameters.
   */
  public async sendRequest<Params, Response, Error>(
      type: RequestType<Params, Response, Error>,
      params: Params,
      token: CancellationToken
  ): Promise<Response> {
    if (!this.isRunning()) {
      throw new Error('Tried to send request while server is not started.');
    }

    try {
      const response = await this._languageClient.sendRequest(type, params, token);
      return response;
    } catch (e) {
      throw this.convertServerError(type.method, e);
    }
  }

  /**
   * Makes an LSP request to the server with a given type and no parameters
   */
  public async sendRequest0<Response, Error>(
    type: RequestType0<Response, Error>,
    token: CancellationToken
  ): Promise<Response> {
    if (!this.isRunning()) {
        throw new Error('Tried to send request while server is not started.');
    }

    try {
      const response = await this._languageClient.sendRequest(type, token);
      return response;
    } catch (e) {
      throw this.convertServerError(type.method, e);
    }
  }

  public async sendRequestWithProgress<P extends PartialResultParams, R, PR, E, RO>(
    type: ProtocolRequestType<P, R, PR, E, RO>,
    params: P,
    onProgress: (p: PR) => Promise<any>,
    cancellationToken?: CancellationToken
  ): Promise<R> {
    // Generate a UUID for our partial result token and apply it to our request.
    const partialResultToken: string = uuid.v4();
    params.partialResultToken = partialResultToken;
    // Register the callback for progress events.
    const disposable = this._languageClient.onProgress(type, partialResultToken, async (partialResult) => {
      await onProgress(partialResult);
    });

    try {
      const response = await this._languageClient.sendRequest(type, params, cancellationToken);
      return response;
    } catch (e) {
      throw this.convertServerError(type.method, e);
    } finally {
      disposable.dispose();
    }
  }

  public async checkUpdate() {
    if (workspace.getConfiguration('csharp').get<string>('server.path')) {
      return;
    }

    const lastCheck = this._context.globalState.get<number>('roslyn.lastCheckUpdate', 0);
    const now = Date.now();
    if (now - lastCheck < getUpdateDuration()) {
      return;
    }

    const roslynPackage = new RoslynLanguageServerPackage(this._context);
    const downloader = new AzureDevOpsPackageDownloader(this._context, roslynPackage);
    const latestVersion = await downloader.getLatestVersion();
    const currentVersion = this._context.globalState.get<string>('roslyn.version');
    if (!currentVersion || latestVersion === currentVersion) {
      return;
    }

    const chosen = await window.showInformationMessage(
      `New version ${latestVersion} of roslyn server is available, do you want to update?`,
      { title: 'Update and restart the server', action: 'updateAndRestart' },
      { title: 'Update but do not restart the server', action: 'update' },
      { title: 'Skip this time', action: 'skip' },
    );
    if (!chosen) {
      return;
    }

    if (chosen.action !== 'skip') {
      await downloader.download()
      if (chosen.action === 'updateAndRestart') {
        await this.restart();
        await downloader.removeOldVersions();
      }
    }
    this._context.globalState.update('roslyn.lastCheckUpdate', now);
  }

  public async openSolution(solutionFile: Uri): Promise<void> {
    this._solutionFile = solutionFile;
    this._projectFiles = [];
    await this.sendOpenSolutionAndProjectsNotifications();
  }

  public async openProjects(projectFiles: Uri[]): Promise<void> {
    this._solutionFile = undefined;
    this._projectFiles = projectFiles;
    await this.sendOpenSolutionAndProjectsNotifications();
  }

  private async sendOpenSolutionAndProjectsNotifications(): Promise<void> {
    if (this._solutionFile !== undefined) {
      const solution = UriConverter.serialize(this._solutionFile);
      await this._languageClient.sendNotification(RoslynProtocol.OpenSolutionNotification.type, {
        solution: solution
      });
    } else if (this._projectFiles.length > 0) {
      const projects = this._projectFiles.map(UriConverter.serialize);
      await this._languageClient.sendNotification(RoslynProtocol.OpenProjectNotification.type, {
        projects: projects,
      });
    } else {
      return;
    }
  }

  private convertServerError(request: string, e: any): Error {
    let error: Error;
    if (e instanceof ResponseError && e.code === -32800) {
      // Convert the LSP RequestCancelled error (code -32800) to a CancellationError so we can handle cancellation uniformly.
      error = new CancellationError();
    } else if (e instanceof Error) {
      error = e;
    } else if (typeof e === 'string') {
      error = new Error(e);
    } else {
      error = new Error(`Unknown error: ${e.toString()}`);
    }

    if (!(error instanceof CancellationError)) {
      this._context.logger.error(`Error making ${request} request`, error);
    }
    return error;
  }

  private registerSendOpenSolution() {
    this._languageClient.onDidChangeState(async (state) => {
      if (state.newState === State.Running) {
        if (this._solutionFile || this._projectFiles.length > 0) {
          await this.sendOpenSolutionAndProjectsNotifications();
        } else {
          await this.openDefaultSolutionOrProjects();
        }
      }
    });
  }

  private async openDefaultSolutionOrProjects(): Promise<void> {
    const defaultSolution = getDefaultSolution();
    if (defaultSolution !== 'disable' && this._solutionFile === undefined) {
      if (defaultSolution !== undefined && defaultSolution !== '') {
        await this.openSolution(Uri.file(defaultSolution));
      } else {
        // Auto open if there is just one solution target; if there's more the one we'll just let the user pick with the picker.
        const solutionUris = await workspace.findFiles('**/*.sln', '**/node_modules/**', 2);
        if (solutionUris) {
          if (solutionUris.length === 1) {
            await this.openSolution(solutionUris[0]);
          } else if (solutionUris.length > 1) {
            // We have more than one solution, so we'll prompt the user to use the picker.
            const chosen = await window.showInformationMessage(
              'Your workspace has multiple Visual Studio Solution files; please select one to get full IntelliSense.',
              { title: 'Choose', action: 'open' },
              { title: 'Choose and set default', action: 'openAndSetDefault' },
              { title: 'Do not load any', action: 'disable' }
            );

            if (chosen) {
              if (chosen.action === 'disable') {
                await workspace
                  .getConfiguration()
                  .update('dotnet.defaultSolution', 'disable', false);
              } else {
                const chosenSolution: Uri | undefined = await commands.executeCommand(
                    'dotnet.openSolution'
                );
                if (chosen.action === 'openAndSetDefault' && chosenSolution) {
                  const relativePath = workspace.asRelativePath(chosenSolution);
                  await workspace
                    .getConfiguration()
                    .update('dotnet.defaultSolution', relativePath, false);
                }
              }
            }
          } else if (solutionUris.length === 0) {
            // We have no solutions, so we'll enumerate what project files we have and just use those.
            const projectUris = await workspace.findFiles(
              '**/*.csproj',
              '**/node_modules/**',
            );

            await this.openProjects(projectUris);
          }
        }
      }
    }
  }

  public static async initializeAsync(context: ExtensionContext): Promise<RoslynLanguageServer> {
    const serverOptions: ServerOptions = () => {
      return this.startServerAsync(context);
    }

    const outputChannel = window.createOutputChannel('csharp');
    const documentSelector: DocumentSelector = [
      { scheme: 'file', language: 'cs' },
      { scheme: 'file', language: 'csharp' },
    ];
    const clientOptions: LanguageClientOptions = {
      documentSelector: documentSelector,
      synchronize: {
        fileEvents: [],
      },
      outputChannel: outputChannel,
      middleware: {
        workspace: {
          configuration: readConfigurations,
        },
        resolveCompletionItem: resolveCompletionItem,
        provideHover: provideHover,
      },
      uriConverter: {
        code2Protocol: UriConverter.serialize,
      },
    };

    const client = new LanguageClient('csharp', 'C# Language Server', serverOptions, clientOptions);
    const server = new RoslynLanguageServer(client, context);
    if (client.clientOptions.middleware) {
      client.clientOptions.middleware.provideDocumentSemanticTokens = (document, token, next) => provideDocumentSemanticTokens(server, document, token, next);
      client.clientOptions.middleware.provideDocumentRangeSemanticTokens = (document, range, token, next) => provideDocumentRangeSemanticTokens(server, document, range, token, next);
    }

    context.subscriptions.push(
      services.registerLanguageClient(client),
    );
    return server;
  }

  private static async startServerAsync(context: ExtensionContext): Promise<MessageTransports> {
    const dotnet = await DotnetResolver.getDotnetExecutable();
    if (!dotnet) {
      throw new Error('Could not find the dotnet executable');
    }

    const serverPath = await getServerPath(context);
    let args: string[] = [ serverPath ];
    args.push(... getArguments(context.storagePath));
    const cpOptions: cp.SpawnOptions = {
      detached: true,
      windowsHide: true,
      env: process.env,
    };
    let childProcess: cp.ChildProcess = cp.spawn(dotnet, args, cpOptions);

    childProcess.stdout?.on('data', (data: { toString: (arg0: any) => any }) => {
      const result: string = isString(data) ? data : data.toString('utf-8');
      context.logger.info('stdout: ' + result);
    });
    childProcess.stderr?.on('data', (data: { toString: (arg0: any) => any }) => {
      const result: string = isString(data) ? data : data.toString('utf-8');
      context.logger.error('stderr: ' + result);
    });
    childProcess.on('exit', (code) => {
      context.logger.info(`The roslyn language server exited with code ${code}`);
    });

    const timeout = new Promise<undefined>((resolve) => {
      const timeout = workspace.getConfiguration('csharp').get<number>('startTimeout') ?? 30000;
      RAL().timer.setTimeout(resolve, timeout);
    });

    const connectionPromise = new Promise<net.Socket>((resolveConnection, rejectConnection) => {
      // If the child process exited unexpectedly, reject the promise early.
      // Error information will be captured from the stdout/stderr streams above.
      childProcess.on('exit', (code) => {
        if (code && code !== 0) {
          rejectConnection(new Error('The roslyn language server exited unexpectedly'));
        }
      });

      // The server process will create the named pipe used for communication. Wait for it to be created,
      // and listen for the server to pass back the connection information via stdout.
      const namedPipePromise = new Promise<NamedPipeInformation>((resolve) => {
        context.logger.debug('Waiting for named pipe information from server...');
        childProcess.stdout?.on('data', (data: { toString: (arg0: any) => any }) => {
          const result: string = isString(data) ? data : data.toString('utf-8');
          // Use the regular expression to find all JSON lines
          const jsonLines = result.match(RoslynLanguageServer.namedPipeKeyRegex);
          if (jsonLines) {
            const transmittedPipeNameInfo: NamedPipeInformation = JSON.parse(jsonLines[0]);
            context.logger.info('Received named pipe information from server');
            resolve(transmittedPipeNameInfo);
          }
        });
      });

      const socketPromise = namedPipePromise.then(async (pipeConnectionInfo) => {
        return new Promise<net.Socket>((resolve, reject) => {
          context.logger.debug('Attempting to connect client to server...');
          const socket = net.createConnection(pipeConnectionInfo.pipeName, () => {
            context.logger.info('Client has connected to server');
            resolve(socket);
          });

          // If we failed to connect for any reason, ensure the error is propagated.
          socket.on('error', (err) => reject(err));
        });
      });

      socketPromise.then(resolveConnection, rejectConnection);
    });

    // Wait for the client to connect to the named pipe.
    let socket: net.Socket | undefined = await Promise.race([connectionPromise, timeout]);

    if (socket === undefined) {
      throw new Error('Timeout, Client could not connect to server via named pipe');
    }

    return {
      reader: new SocketMessageReader(socket),
      writer: new SocketMessageWriter(socket),
    };
  }
}

function getDownloadedServerPath(context: ExtensionContext): string | undefined {
  const version = context.globalState.get<string>('roslyn.version');
  if (!version) {
    return undefined;
  }

  const roslynPackage = new RoslynLanguageServerPackage(context);
  const runtime = roslynPackage.runtimeIdentifier;
  const serverPath = path.join(roslynPackage.targetRootPath, version, 'content', 'LanguageServer', runtime, 'Microsoft.CodeAnalysis.LanguageServer.dll')
  return fs.existsSync(serverPath) ? serverPath : undefined;
}

async function getServerPath(context: ExtensionContext): Promise<string> {
  let serverPath = workspace.getConfiguration('csharp').get<string>('server.path');
  if (!serverPath) {
    let downloadedServerPath = getDownloadedServerPath(context);
    if (downloadedServerPath) {
      return downloadedServerPath;
    }

    const roslynPackage = new RoslynLanguageServerPackage(context);
    const downloader = new AzureDevOpsPackageDownloader(context, roslynPackage);
    await downloader.download();
    downloadedServerPath = getDownloadedServerPath(context);
    if (!downloadedServerPath) {
      throw new Error('Failed to download the roslyn language server');
    }
    return downloadedServerPath;
  } else {
    let resolvedPath = workspace.expand(serverPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`The roslyn language server path ${serverPath} doesn't exist.`);
    }
    return resolvedPath;
  }
}

function getArguments(pluginRoot: string): string[] {
  const logPath = path.join(pluginRoot, 'logs');
  if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath);
  }

  // TODO:
  // 1. Make the log level configurable.
  // 2. Add more args (razor, etc.)
  // <2024-11-16, Adam Tao>
  let args: string[] = [
    '--logLevel', 'Information',
    '--extensionLogDirectory', logPath,
  ];
  return args
}

function getDefaultSolution(): string | undefined {
  let defaultSolution = workspace.getConfiguration().get<string>('dotnet.defaultSolution');
  if (defaultSolution === undefined || defaultSolution === '') {
    return undefined;
  } else if (defaultSolution === 'disable') {
    return defaultSolution;
  }
  if (path.isAbsolute(defaultSolution)) {
    return defaultSolution;
  }

  for (const folder of workspace.workspaceFolders) {
    let defaultSolution = workspace.getConfiguration(undefined, folder).get<string>('dotnet.defaultSolution');
    if (defaultSolution !== undefined && defaultSolution !== '' && defaultSolution !== 'disable') {
      return path.join(Uri.parse(folder.uri).fsPath, defaultSolution);
    }
  }
  return undefined;
}

function isString(value: any): value is string {
    return typeof value === 'string' || value instanceof String;
}

function getUpdateDuration(): number {
  const duration = workspace.getConfiguration('csharp').get<string>('server.checkUpdateDuration');
  switch (duration) {
    case 'never':
      return Number.MAX_VALUE;
    case 'always':
      return 0;
    case 'daily':
      return 1000 * 60 * 60 * 24;
    case 'monthly':
      return 1000 * 60 * 60 * 24 * 30;
    case 'weekly':
    default:
      return 1000 * 60 * 60 * 24 * 7;
  }
}
