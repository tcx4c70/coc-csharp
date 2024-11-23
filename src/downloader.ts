import * as fs from 'node:fs';
import * as path from 'node:path';
import * as stream from 'node:stream';
import { promisify } from 'node:util';
import fetch from 'node-fetch';
import * as libc from 'detect-libc';
import * as unzip from 'unzip-stream';
import { ExtensionContext, window } from 'coc.nvim';

const apiVersion = '7.1-preview.1';

export interface IAzureDevOpsPackage {
    organization: string;
    project: string;
    feed: string;
    packageName: string;
    targetRootPath: string;
}

export class RoslynLanguageServerPackage implements IAzureDevOpsPackage {
    public constructor(private _context: ExtensionContext) {
    }

    get organization(): string {
        return 'azure-public';
    }

    get project(): string {
        return 'vside';
    }

    get feed(): string {
        return 'vs-impl';
    }

    get packageName(): string {
        return `Microsoft.CodeAnalysis.LanguageServer.${this.runtimeIdentifier}`;
    }

    get targetRootPath(): string {
        return path.join(this._context.storagePath, 'roslyn');
    }

    get runtimeIdentifier(): string {
        const platforms: Map<string, string> = new Map([
            [ 'linux', 'linux' ],
            [ 'win32', 'win' ],
            [ 'darwin', 'osx' ],
        ]);

        const archs: Map<string, string> = new Map([
            [ 'x64', 'x64' ],
            [ 'arm64', 'arm64' ],
        ]);

        const platform = platforms.get(process.platform);
        const arch = archs.get(process.arch);
        if (platform === undefined || arch === undefined) {
            throw new Error(`Unsupported platform or architecture: ${process.platform} ${process.arch}`);
        }
        if (platform === 'linux' && libc.familySync() === 'musl') {
            return `${platform}-musl-${arch}`;
        } else {
            return `${platform}-${arch}`;
        }
    }
}

// The following interfaces are extracted from the Azure DevOps REST API: https://learn.microsoft.com/en-us/rest/api/azure/devops/artifacts/artifact-details/get-packages?view=azure-devops-rest-7.1
// Only the necessary fields are included here.
interface AzureDevOpsPackageVersion {
    id: string;
    normalizedVersion: string;
    version: string;
    isLatest: boolean;
    isListed: boolean;
    storageId: string;
    publishDate: string;
}

interface AzureDevOpsPackage {
    id: string;
    name: string;
    normalizedName: string;
    protocolType: string;
    url: string;
    versions: Array<AzureDevOpsPackageVersion>;
}

interface AzureDevOpsPackageList {
    count: number;
    value: Array<AzureDevOpsPackage>;
}

export class AzureDevOpsPackageDownloader {
    private _latestVersion: string | undefined;

    public constructor(private _context: ExtensionContext, private _package: IAzureDevOpsPackage) {
    }

    public async getLatestVersion(): Promise<string> {
        if (this._latestVersion === undefined) {
            this._latestVersion = await this.fetchLatestVersion();
        }
        return this._latestVersion;
    }

    public async download(version: string | undefined = undefined): Promise<void> {
        version = version || await this.getLatestVersion();

        // REST API: https://learn.microsoft.com/en-us/rest/api/azure/devops/artifactspackagetypes/nuget/download-package?view=azure-devops-rest-7.1
        const { organization, project, feed, packageName } = this._package;

        const statusItem = window.createStatusBarItem(0, { progress: true });
        statusItem.text = `Downloading ${packageName} ${version}`;
        statusItem.show();

        const url = `https://pkgs.dev.azure.com/${organization}/${project}/_apis/packaging/feeds/${feed}/nuget/packages/${packageName}/versions/${version}/content?api-version=7.1-preview.1`
        const response = await fetch(url);
        if (!response.ok) {
            statusItem.hide();
            throw new Error(`Failed to download package ${packageName} ${version}: ${response.statusText}`);
        }

        let downloadSize = 0;
        const len = Number(response.headers.get('Content-Length'));
        response.body.on('data', (chunk: Buffer) => {
            downloadSize += chunk.length;
            const process = ((downloadSize / len) * 100).toFixed(2);
            statusItem.text = `Downloading ${packageName} ${version} ${process}%`;
        });

        const downloadPath = path.join(this._package.targetRootPath, version);
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        await promisify(stream.pipeline)(response.body, unzip.Extract({ path: downloadPath })).catch(e => {
            fs.rmdirSync(downloadPath, { recursive: true });
            statusItem.hide();
            throw e;
        });

        this._context.globalState.update('roslyn.version', version);

        statusItem.hide();
    }

    public async removeOldVersions(): Promise<void> {
        const newVersion = await this.getLatestVersion();
        const versions = fs.readdirSync(this._package.targetRootPath);
        for (const version of versions) {
            if (version !== newVersion) {
                fs.rm(
                    path.join(this._package.targetRootPath, version),
                    { recursive: true, force: true },
                    (err) => {
                        if (err) {
                            window.showErrorMessage(`Failed to remove old ${this._package.packageName} version: ${version}`);
                        }
                    });
            }
        }
    }

    private async fetchLatestVersion(): Promise<string> {
        // REST API: https://learn.microsoft.com/en-us/rest/api/azure/devops/artifacts/artifact-details/get-packages?view=azure-devops-rest-7.1
        const { organization, project, feed, packageName } = this._package;
        const url = `https://feeds.dev.azure.com/${organization}/${project}/_apis/packaging/feeds/${feed}/packages?packageNameQuery=${packageName}&api-version=${apiVersion}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch latest version: ${response.statusText}`);
        }

        const packages: AzureDevOpsPackageList = await response.json();
        if (packages.count === 0) {
            throw new Error(`No packages found: ${packageName}`);
        }
        const latestVersion = packages.value[0].versions.filter((version) => version.isLatest);
        if (latestVersion.length === 0) {
            throw new Error(`No latest version found: ${packageName}`);
        }
        return latestVersion[0].normalizedVersion;
    }
}
