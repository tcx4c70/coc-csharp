/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, commands, window, workspace } from 'coc.nvim';
import { CodeAction, CodeActionResolveRequest, LSPAny } from 'vscode-languageserver-protocol';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { getFixAllResponse } from './fixAllCodeAction';

export function registerNestedCodeActionCommands(
    context: ExtensionContext,
    languageServer: RoslynLanguageServer,
) {
    context.subscriptions.push(
        commands.registerCommand(
            'roslyn.client.nestedCodeAction',
            async (request): Promise<void> => registerNestedResolveCodeAction(languageServer, request)
        )
    );
}

async function registerNestedResolveCodeAction(
    languageServer: RoslynLanguageServer,
    codeActionData: any,
): Promise<void> {
    if (codeActionData) {
        const data = <LSPAny>codeActionData;
        const actions = data.NestedCodeActions;

        if (actions.length > 0) {
            const codeActionTitles = getCodeActionTitles(actions);
            const selectedValue = await window.showQuickPick(codeActionTitles, {
                title: data.UniqueIdentifier,
            });
            if (selectedValue) {
                const selectedAction = selectedValue.codeAction;
                if (!selectedAction) {
                    return;
                }

                if (selectedAction.data.FixAllFlavors) {
                    await getFixAllResponse(selectedAction.data, languageServer);
                    return;
                }

                await window.withProgress(
                    {
                        title: 'Nested Code Action',
                        cancellable: true,
                    },
                    async (_, token) => {
                        const nestedCodeActionResolve: CodeAction = {
                            title: selectedAction.title,
                            data: selectedAction.data,
                        };

                        const response = await languageServer.sendRequest(
                            CodeActionResolveRequest.type,
                            nestedCodeActionResolve,
                            token
                        );

                        if (!response.edit) {
                            window.showErrorMessage(`Failed to make an edit for completion.`);
                            throw new Error('Tried to retrieve a code action edit, but an error occurred.');
                        }

                        if (!(await workspace.applyEdit(response.edit))) {
                            const componentName = '[roslyn.client.nestedCodeAction]';
                            const errorMessage = 'Failed to make am edit for completion.';
                            window.showErrorMessage(`${componentName} ${errorMessage}`);
                            throw new Error('Tried to insert code action edit, but an error occurred.');
                        }
                    }
                );
            }
        }
    }
}

function getCodeActionTitles(nestedActions: any): any[] {
    return nestedActions.map((nestedAction: { data: { CodeActionPath: any; FixAllFlavors: any } }) => {
        const codeActionPath = nestedAction.data.CodeActionPath;
        const fixAllFlavors = nestedAction.data.FixAllFlavors;
        // If there's only one string, return it directly
        if (codeActionPath.length === 1) {
            return codeActionPath;
        }

        // Concatenate multiple strings with " ->"
        const concatenatedString = codeActionPath.slice(1).join(' -> ');
        const fixAllString = 'Fix All: ';
        return {
            label: fixAllFlavors ? `${fixAllString}${concatenatedString}` : concatenatedString,
            codeAction: nestedAction,
        };
    });
}
