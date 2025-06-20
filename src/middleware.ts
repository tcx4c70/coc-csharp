import {
    CancellationToken,
    CompletionItem,
    ConfigurationParams,
    DocumentRangeSemanticTokensSignature,
    DocumentSemanticsTokensSignature,
    LinesTextDocument,
    MarkupContent,
    Position,
    ProvideHoverSignature,
    Range,
    ResolveCompletionItemSignature,
    workspace
} from "coc.nvim";
import { RoslynLanguageServer } from "./roslynLanguageServer";
import { convertServerOptionNameToClientConfigurationName } from "./optionNameConverter";
import { readEquivalentVimConfiguration } from "./universalEditorConfigProvider";

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

function convertMarkupContent(content: string): string {
    // coc.nvim maps the language identifier to the vim syntax file. The roslyn language server use 'csharp' as the
    // language identifier. The syntax file in vim, however, use 'cs'. So we need to convert the language identifier
    content = content.replace(/```csharp/gi, '```cs');

    // Handle the special HTML characters.
    content = content.replace(/&nbsp;/gi, ' ');

    return content;
}

export async function provideHover(document: LinesTextDocument, postion: Position, token: CancellationToken, next: ProvideHoverSignature) {
    let hover = await next(document, postion, token);
    if (!hover || !MarkupContent.is(hover.contents)) {
        return hover;
    }

    hover.contents.value = convertMarkupContent(hover.contents.value);
    return hover;
}

export async function resolveCompletionItem(item: CompletionItem, token: CancellationToken, next: ResolveCompletionItemSignature) {
    let itemResolved = await next(item, token);
    if (!itemResolved || !MarkupContent.is(itemResolved.documentation)) {
        return itemResolved;
    }

    itemResolved.documentation.value = convertMarkupContent(itemResolved.documentation.value);
    return itemResolved;
}

let semanticTokenBlackList: number[] | undefined = undefined;
function getSemanticTokenBlackList(languageServer: RoslynLanguageServer): number[] {
    if (semanticTokenBlackList !== undefined) {
        return semanticTokenBlackList;
    }

    let semanticTokenNameBlackList = workspace.getConfiguration().get<string[]>("csharp.semanticHighlighting.blackList");
    if (semanticTokenNameBlackList === undefined) {
        semanticTokenNameBlackList = [];
    }

    let blackList: number[] = [];
    languageServer.client.initializeResult?.capabilities.semanticTokensProvider?.legend?.tokenTypes.forEach((tokenType, index) => {
        if (semanticTokenNameBlackList.includes(tokenType)) {
            blackList.push(index);
        }
    });
    semanticTokenBlackList = blackList;
    return semanticTokenBlackList;
}

function filterSemanticTokens(languageServer: RoslynLanguageServer, tokens: number[]): number[] {
    let tokenTypeBlackList = getSemanticTokenBlackList(languageServer);
    let filteredTokends: number[] = [];
    let deltaLine: number = 0;
    let deltaStart: number = 0;
    for (let i = 0; i < tokens.length; i += 5) {
        // Note: If the current token and the previous token are not on the same line, deltaStart is relative to 0.
        // Hence we can't just sum them up, we need to reset deltaStart if deltaLine is not 0.
        // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens
        deltaLine += tokens[i];
        deltaStart = tokens[i] == 0 ? deltaStart + tokens[i + 1] : tokens[i + 1];
        if (!tokenTypeBlackList.includes(tokens[i + 3])) {
            filteredTokends.push(deltaLine);
            filteredTokends.push(deltaStart);
            filteredTokends.push(tokens[i + 2]);
            filteredTokends.push(tokens[i + 3]);
            filteredTokends.push(tokens[i + 4]);
            deltaLine = 0;
            deltaStart = 0;
        }
    }
    return filteredTokends;
}

export async function provideDocumentSemanticTokens(languageServer: RoslynLanguageServer, document: LinesTextDocument, token: CancellationToken, next: DocumentSemanticsTokensSignature) {
    let tokens = await next(document, token);
    if (!tokens) {
        return tokens;
    }

    tokens.data = filterSemanticTokens(languageServer, tokens.data);
    return tokens;
}

export async function provideDocumentRangeSemanticTokens(languageServer: RoslynLanguageServer, document: LinesTextDocument, range: Range, token: CancellationToken, next: DocumentRangeSemanticTokensSignature) {
    let tokens = await next(document, range, token);
    if (!tokens) {
        return tokens;
    }

    tokens.data = filterSemanticTokens(languageServer, tokens.data);
    return tokens;
}
