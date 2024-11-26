/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { CancellationError, CancellationTokenSource, ExtensionContext, OutputChannel, QuickPickItem, commands, window } from 'coc.nvim';
import { RoslynLanguageServer } from './roslynLanguageServer';
import {
    RestorableProjects,
    RestoreParams,
    RestorePartialResult,
    RestoreRequest,
    ProjectNeedsRestoreRequest,
} from './roslynProtocol';

let _restoreInProgress = false;

export function registerRestoreCommands(context: ExtensionContext, languageServer: RoslynLanguageServer) {
    const restoreChannel = window.createOutputChannel('.NET NuGet Restore');
    context.subscriptions.push(
        commands.registerCommand('dotnet.restore.project', async (_request): Promise<void> => {
            return chooseProjectAndRestore(languageServer, restoreChannel);
        })
    );
    context.subscriptions.push(
        commands.registerCommand('dotnet.restore.all', async (): Promise<void> => {
            return restore(languageServer, restoreChannel, [], false);
        })
    );

    languageServer.client.onRequest(ProjectNeedsRestoreRequest.type, async (params) => {
        await restore(languageServer, restoreChannel, params.projectFilePaths, false);
    });
}

async function chooseProjectAndRestore(
    languageServer: RoslynLanguageServer,
    restoreChannel: OutputChannel
): Promise<void> {
    let projects: string[];
    try {
        projects = await languageServer.sendRequest0(
            RestorableProjects.type,
            new CancellationTokenSource().token
        );
    } catch (e) {
        if (e instanceof CancellationError) {
            return;
        }

        throw e;
    }

    const items = projects.map((p) => {
        const projectName = path.basename(p);
        const item: QuickPickItem = {
            label: `Restore ${projectName}`,
            description: p,
        };
        return item;
    });

    const pickedItem = await window.showQuickPick(items);
    if (!pickedItem) {
        return;
    }

    await restore(languageServer, restoreChannel, [pickedItem.description!], false);
}

export async function restore(
    languageServer: RoslynLanguageServer,
    restoreChannel: OutputChannel,
    projectFiles: string[],
    showOutput: boolean
): Promise<void> {
    if (_restoreInProgress) {
        window.showErrorMessage('Restore already in progress');
        return;
    }
    _restoreInProgress = true;
    if (showOutput) {
        restoreChannel.show(true);
    }

    const request: RestoreParams = { projectFilePaths: projectFiles };
    await window
        .withProgress(
            {
                title: 'Restore',
                cancellable: true,
            },
            async (progress, token) => {
                const writeOutput = (output: RestorePartialResult) => {
                    if (output.message) {
                        restoreChannel.appendLine(output.message);
                    }

                    progress.report({ message: output.stage });
                };

                progress.report({ message: 'Sending request' });
                const responsePromise = languageServer.sendRequestWithProgress(
                    RestoreRequest.type,
                    request,
                    async (p) => writeOutput(p),
                    token
                );

                await responsePromise.then(
                    (result) => result.forEach((r) => writeOutput(r)),
                    (err) => restoreChannel.appendLine(err)
                );
            }
        )
        .then(
            () => {
                _restoreInProgress = false;
            },
            () => {
                _restoreInProgress = false;
            }
        );

    return;
}
