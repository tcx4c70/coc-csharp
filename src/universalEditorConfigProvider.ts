/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace } from 'coc.nvim';

const universalEditorConfigOptionsToReaderMap: Map<
    string,
    () => Promise<string | undefined>
> = new Map([
    ['codeStyle.formatting.indentationAndSpacing.tabWidth', readTabSize],
    ['codeStyle.formatting.indentationAndSpacing.indentSize', readIndentSize],
    ['codeStyle.formatting.indentationAndSpacing.indentStyle', readInsertSpaces],
    ['codeStyle.formatting.newLine.endOfLine', readEol],
    ['codeStyle.formatting.newLine.insertFinalNewline', readInsertFinalNewline],
]);

export async function readEquivalentVimConfiguration(serverSideOptionName: string): Promise<string | undefined> {
    if (!universalEditorConfigOptionsToReaderMap.has(serverSideOptionName)) {
        return undefined;
    }

    const readerFunction = universalEditorConfigOptionsToReaderMap.get(serverSideOptionName)!;
    return readerFunction();
}

async function readTabSize(): Promise<string> {
    return await workspace.nvim.eval('&tabstop') as string;
}

async function readIndentSize(): Promise<string> {
    return await workspace.nvim.eval('shiftwidth()') as string;
}

async function readInsertSpaces(): Promise<string> {
    const et = await workspace.nvim.eval('&expandtab') as number;
    if (et !== 0) {
        return 'space';
    } else {
        return 'tab';
    }
}

async function readEol(): Promise<string> {
    const ff = await workspace.nvim.eval('&fileformat') as string;
    if (ff === 'dos') {
        return 'crlf';
    } else {
        return 'lf';
    }
}

async function readInsertFinalNewline(): Promise<string> {
    const fixeol = await workspace.nvim.eval('&fixendofline') as number;
    if (fixeol !== 0) {
        return 'true';
    } else {
        return 'false';
    }
}
