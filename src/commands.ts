/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, Uri, commands, window, workspace } from 'coc.nvim';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { createLaunchTargetForSolution } from './launchTarget';

export function registerCommands(
    context: ExtensionContext,
    languageServer: RoslynLanguageServer,
) {
    context.subscriptions.push(
        commands.registerCommand('dotnet.openSolution', async () => openSolution(languageServer))
    );
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
