/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationParams, workspace } from 'coc.nvim';
import { convertServerOptionNameToClientConfigurationName } from './optionNameConverter';
import { readEquivalentVimConfiguration } from './universalEditorConfigProvider';

export async function readConfigurations(params: ConfigurationParams): Promise<(string | null)[]> {
    // Note: null means there is no such configuration in client.
    // If the configuration is null, should push 'null' to result.
    const result: (string | null)[] = [];
    const settings = workspace.getConfiguration();

    for (const configurationItem of params.items) {
        const section = configurationItem.section;
        // Currently only support global option.
        if (section === undefined || configurationItem.scopeUri !== undefined) {
            result.push(null);
            continue;
        }

        // Server use a different name compare to the name defined in client, so do the remapping.
        const clientSideName = convertServerOptionNameToClientConfigurationName(section);
        if (clientSideName == null) {
            result.push(null);
            continue;
        }

        let value = settings.get<string>(clientSideName);
        if (value !== undefined) {
            result.push(value);
            continue;
        }

        value = await readEquivalentVimConfiguration(clientSideName);
        if (value !== undefined) {
            result.push(value);
            continue;
        }

        result.push(null);
    }

    return result;
}
