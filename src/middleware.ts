import {
    CancellationToken,
    CompletionItem,
    ConfigurationParams,
    MarkupContent,
    Position,
    ProvideHoverSignature,
    ResolveCompletionItemSignature,
    TextDocument,
    workspace
} from "coc.nvim";
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

export async function provideHover(document: TextDocument, postion: Position, token: CancellationToken, next: ProvideHoverSignature) {
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
