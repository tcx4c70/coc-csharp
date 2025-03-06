# coc-csharp

C# extension for coc.nvim which uses [Roslyn](https://github.com/dotnet/roslyn/tree/main/src/LanguageServer/Microsoft.CodeAnalysis.LanguageServer) language server.

Almost all the code is taken from [vscode-csharp](https://github.com/dotnet/vscode-csharp) with some modifications to work with coc.nvim.

> Note: This extension is still in development and may not work as expected. And I'm a newbie in TypeScript (actually, it's my first time to write TypeScript), so the code may not be the best. Any PRs are welcome.

## Install

1. Install [coc.nvim](https://github.com/neoclide/coc.nvim)
2. Install [.NET SDK](https://dotnet.microsoft.com/download)
3. Install Roslyn language server (Optional. If you don't specify the path via `csharp.server.path`, the extension will try to download the language server automatically)
    1. Navigate to [this feed](https://dev.azure.com/azure-public/vside/_artifacts/feed/vs-impl), search for `Microsoft.CodeAnalysis.LanguageServer` and download the version matching your OS and architecture.
    2. Unzip the downloaded `.nupkg`
    3. (Optional) Copy the contents of `<zip_root>/content/LanguageServer/<your_arch>` to a directory of your choice
    3. Check if it's working by running `dotnet <root_dir>/content/LanguageServer/<your_arch>/Microsoft.CodeAnalysis.LanguageServer.dll --version`
    4. Set `csharp.server.path` to the path of the `<root_dir>/content/LanguageServer/<your_arch>/Microsoft.CodeAnalysis.LanguageServer.dll` in your `coc-settings.json`
4. Install the extension by running `:CocInstall @tcx4c70/coc-csharp`

## Configurations

| Key                                                                       | Description                                                                                                                                                                                     | Default                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `csharp.enable`                                                           | Enable coc-csharp extension                                                                                                                                                                     | `true`                            |
| `csharp.server.path`                                                      | Path to the Roslyn language server                                                                                                                                                              | `""`                              |
| `csharp.server.checkUpdateDuration`                                       | Duration to check for updates of roslyn language server (only work if coc.server.path is empty)                                                                                                 | `"weekly"`                        |
| `csharp.semanticHighlighting.blackList`                                   | List of semantic token type names that should be excluded from semantic highlighting. For example, ['punctuation', 'decorator']                                                                 | `[]`                              | 
| `dotnet.typeMembers.memberInsertionLocation`                              | The insertion location of properties, events, and methods When implement interface or abstract class                                                                                            | `"withOtherMembersOfTheSameKind"` |
| `dotnet.typeMembers.propertyGenerationBehavior`                           | Generation behavior of properties when implement interface or abstract class                                                                                                                    | `"preferThrowingProperties"`      |
| `dotnet.codeLens.enableReferencesCodeLens`                                | Specifies whether the references CodeLens should be shown                                                                                                                                       | `true`                            |
| `dotnet.completion.showCompletionItemsFromUnimportedNamespaces`           | Enables support for showing unimported types and unimported extension methods in completion lists. When committed, the appropriate using directive will be added at the top of the current file | `true`                            |
| `dotnet.completion.showNameCompletionSuggestions`                         | Perform automatic object name completion for the members that you have recently selected                                                                                                        | `true`                            |
| `dotnet.completion.provideRegexCompletions`                               | Show regular expressions in completion list                                                                                                                                                     | `true`                            |
| `dotnet.completion.triggerCompletionInArgumentLists`                      | Automatically show completion list in argument lists                                                                                                                                            | `true`                            |
| `dotnet.backgroundAnalysis.analyzerDiagnosticsScope`                      | Run background code analysis for:                                                                                                                                                               | `openFiles`                       |
| `dotnet.backgroundAnalysis.compilerDiagnosticsScope`                      | Show compiler errors and warnings for:                                                                                                                                                          | `openFiles`                       |
| `dotnet.highlighting.highlightRelatedRegexComponents`                     | Highlight related regular expression components under cursor                                                                                                                                    | `true`                            |
| `dotnet.highlighting.highlightRelatedJsonComponents`                      | Highlight related JSON components under cursor                                                                                                                                                  | `true`                            |
| `csharp.inlayHints.enableInlayHintsForImplicitObjectCreation`             | Show hints for implicit object creation                                                                                                                                                         | `false`                           |
| `csharp.inlayHints.enableInlayHintsForImplicitVariableTypes`              | Show hints for variables with inferred types                                                                                                                                                    | `false`                           |
| `csharp.inlayHints.enableInlayHintsForLambdaParameterTypes`               | Show hints for lambda parameter types                                                                                                                                                           | `false`                           |
| `csharp.inlayHints.enableInlayHintsForTypes`                              | Display inline type hints                                                                                                                                                                       | `false`                           |
| `dotnet.inlayHints.enableInlayHintsForIndexerParameters`                  | Show hints for indexers                                                                                                                                                                         | `false`                           |
| `dotnet.inlayHints.enableInlayHintsForLiteralParameters`                  | Show hints for literals                                                                                                                                                                         | `false`                           |
| `dotnet.inlayHints.enableInlayHintsForObjectCreationParameters`           | Show hints for 'new' expressions                                                                                                                                                                | `false`                           |
| `dotnet.inlayHints.enableInlayHintsForOtherParameters`                    | Show hints for everything else                                                                                                                                                                  | `false`                           |
| `dotnet.inlayHints.enableInlayHintsForParameters`                         | Display inline parameter name hints                                                                                                                                                             | `false`                           |
| `dotnet.inlayHints.suppressInlayHintsForParametersThatDifferOnlyBySuffix` | Suppress hints when parameter names differ only by suffix                                                                                                                                       | `false`                           |
| `dotnet.inlayHints.suppressInlayHintsForParametersThatMatchArgumentName`  | Suppress hints when argument matches parameter name                                                                                                                                             | `false`                           |
| `dotnet.inlayHints.suppressInlayHintsForParametersThatMatchMethodIntent`  | Suppress hints when parameter name matches the method's intent                                                                                                                                  | `false`                           |
| `dotnet.navigation.navigateToDecompiledSources`                           | Enable navigation to decomplied sources                                                                                                                                                         | `true`                            |
| `dotnet.navigation.navigateToSourceLinkAndEmbeddedSources`                | Enable navigation to source link and embedded sources                                                                                                                                           | `true`                            |
| `dotnet.quickInfo.showRemarksInQuickInfo`                                 | Show remarks information when display symbol                                                                                                                                                    | `true`                            |
| `dotnet.symbolSearch.searchReferenceAssemblies`                           | Search symbols in reference assemblies. It affects features requires symbol searching, such as add imports                                                                                      | `true`                            |
| `dotnet.projects.binaryLogPath`                                           | Sets a path where MSBuild binary logs are written to when loading projects, to help diagnose loading errors                                                                                     | `null`                            |
| `dotnet.projects.enableAutomaticRestore`                                  | Enables automatic NuGet restore if the extension detects assets are missing                                                                                                                     | `true`                            |

## Commands

| Command                   | Description               |
| ------------------------- | ------------------------- |
| `dotnet.openSolution`     | Open Solution             |
| `dotnet.restartServer`    | Restart Language Server   |
| `dotnet.restore.all`      | Restore All Projects      |
| `dotnet.restore.project`  | Restore Project           |

## TODO

- [ ] Support more LSP extensions from the language server
- [ ] Add Razor support

## Thanks

- [vscode-csharp](https://github.com/dotnet/vscode-csharp)
- [Roslyn language server](https://github.com/dotnet/roslyn/tree/main/src/LanguageServer/Microsoft.CodeAnalysis.LanguageServer)

## License

MIT

---

> This extension is built with [create-coc-extension](https://github.com/fannheyward/create-coc-extension)
