import { ExtensionContext, workspace } from 'coc.nvim';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { registerCommands } from './commands';

export async function activate(context: ExtensionContext): Promise<void> {
  if (workspace.getConfiguration('csharp').get<boolean>('enable') === false) {
    return;
  }

  const languageServer = await RoslynLanguageServer.initializeAsync(context);
  registerCommands(context, languageServer);
}
