# coc-csharp

C# extension for coc.nvim which uses [Roslyn](https://github.com/dotnet/roslyn/tree/main/src/LanguageServer/Microsoft.CodeAnalysis.LanguageServer) language server.

Almost all the code is taken from [vscode-csharp](https://github.com/dotnet/vscode-csharp) with some modifications to work with coc.nvim.

> Note: This extension is still in development and may not work as expected. And I'm a newbie in TypeScript (actually, it's my first time to write TypeScript), so the code may not be the best. Any PRs are welcome.

## Install

1. Install [coc.nvim](https://github.com/neoclide/coc.nvim)
2. Install [.NET SDK](https://dotnet.microsoft.com/download)
3. Install Roslyn language server
    1. Navigate to [this feed], search for `Microsoft.CodeAnalysis.LanguageServer` and download the version matching your OS and architecture.
    2. Unzip the downloaded `.nupkg`
    3. (Optional) Copy the contents of `<zip_root>/content/LanguageServer/<your_arch>` to a directory of your choice
    3. Check if it's working by running `dotnet <root_dir>/content/LanguageServer/<your_arch>/Microsoft.CodeAnalysis.LanguageServer.dll --version`
    4. Set `csharp.server.path` to the path of the `<root_dir>/content/LanguageServer/<your_arch>/Microsoft.CodeAnalysis.LanguageServer.dll` in your `coc-settings.json`
4. Install the extension by running `:CocInstall @tcx4c70/coc-csharp`

## Configurations

- `csharp.enable`: Enable coc-csharp extension, default: `true`
- `csharp.server.path`: Path to the Roslyn language server, default: `""`

## TODO

- [ ] Extract the configurations from the initialization of the language server. Actually, the extension supports lots of configurations from the language server, which I haven't listed them in the README & package.json now.
- [ ] Download the Roslyn language server automatically
- [ ] Support more LSP extensions from the language server
- [ ] Add Razor support

## Thanks

- [vscode-csharp](https://github.com/dotnet/vscode-csharp)
- [Roslyn language server](https://github.com/dotnet/roslyn/tree/main/src/LanguageServer/Microsoft.CodeAnalysis.LanguageServer)

## License

MIT

---

> This extension is built with [create-coc-extension](https://github.com/fannheyward/create-coc-extension)
