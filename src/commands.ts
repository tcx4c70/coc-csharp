/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, Uri, Position, commands, languages, window, workspace } from 'coc.nvim';
import { CancellationTokenSource } from 'vscode-languageserver-protocol';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { createLaunchTargetForSolution } from './launchTarget';
import { UriConverter } from './uriConverter';

export function registerCommands(
    context: ExtensionContext,
    languageServer: RoslynLanguageServer,
) {
    context.subscriptions.push(
        commands.registerCommand('roslyn.client.peekReferences', peekReferencesCallback)
    );
    context.subscriptions.push(
        commands.registerCommand('dotnet.restartServer', languageServer.restart)
    )
    context.subscriptions.push(
        commands.registerCommand('dotnet.openSolution', async () => openSolution(languageServer))
    );
}

/**
 * Callback for code lens commands.  Executes a references request via the VSCode command
 * which will call into the LSP server to get the data.  Then calls the VSCode command to display the result.
 * @param uriStr The uri containing the location to find references for.
 * @param serverPosition The position json object to execute the find references request.
 */
async function peekReferencesCallback(uriStr: string, serverPosition: Position): Promise<void> {
    const uri = UriConverter.deserialize(uriStr);
    const textDocument = workspace.getDocument(uriStr).textDocument;
    const cancellationTokenSource = new CancellationTokenSource();
    const references = await languages.getReferences(textDocument, { includeDeclaration: true }, serverPosition, cancellationTokenSource.token);

    if (references && Array.isArray(references)) {
        // The references could come back after the document has moved to a new state (that may not even contain the position).
        // This is fine - the VSCode API is resilient to that scenario and will not crash.
        await commands.executeCommand('editor.action.showReferences', uri, serverPosition, references);
    }
}

async function openSolution(languageServer: RoslynLanguageServer): Promise<Uri | undefined> {
    if (!workspace.workspaceFolders) {
        return undefined;
    }

    const solutionFiles = await workspace.findFiles('**/*.{sln,slnf}');
    const launchTargets = solutionFiles.map(createLaunchTargetForSolution);
    const launchTarget = await window.showQuickPick(launchTargets, {
        matchOnDescription: true,
        placeholder: `Select solution file`,
    });

    if (launchTarget) {
        const uri = Uri.file(launchTarget.target);
        await languageServer.openSolution(uri);
        return uri;
    }
}
