/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, commands, window, workspace } from 'coc.nvim';
import * as RoslynProtocol from './roslynProtocol';
import { LSPAny } from 'vscode-languageserver-protocol';
import { RoslynLanguageServer } from './roslynLanguageServer';

export function registerCodeActionFixAllCommands(
    context: ExtensionContext,
    languageServer: RoslynLanguageServer,
) {
    context.subscriptions.push(
        commands.registerCommand(
            'roslyn.client.fixAllCodeAction',
            async (request): Promise<void> => registerFixAllResolveCodeAction(languageServer, request)
        )
    );
}

export async function getFixAllResponse(
    data: RoslynProtocol.CodeActionResolveData,
    languageServer: RoslynLanguageServer,
) {
    if (!data.FixAllFlavors) {
        throw new Error(`FixAllFlavors is missing from data ${JSON.stringify(data)}`);
    }

    const result: string | undefined = await window.showQuickPick(data.FixAllFlavors, {
        title: 'Pick a fix all scope',
    });

    await window.withProgress(
        {
            title: 'Fix All Code Action',
            cancellable: true,
        },
        async (_, token) => {
            if (result) {
                const fixAllCodeAction: RoslynProtocol.RoslynFixAllCodeAction = {
                    title: data.UniqueIdentifier,
                    data: data,
                    scope: result,
                };

                const response = await languageServer.sendRequest(
                    RoslynProtocol.CodeActionFixAllResolveRequest.type,
                    fixAllCodeAction,
                    token
                );

                if (response.edit) {
                    if (!(await workspace.applyEdit(response.edit))) {
                        const componentName = '[roslyn.client.fixAllCodeAction]';
                        const errorMessage = 'Failed to make a fix all edit for completion.';
                        window.showErrorMessage(`${componentName} ${errorMessage}`);
                        throw new Error('Tried to insert multiple code action edits, but an error occurred.');
                    }
                }
            }
        }
    );
}

async function registerFixAllResolveCodeAction(
    languageServer: RoslynLanguageServer,
    codeActionData: RoslynProtocol.CodeActionResolveData,
) {
    if (codeActionData) {
        const data = <LSPAny>codeActionData;
        await getFixAllResponse(data, languageServer);
    }
}
