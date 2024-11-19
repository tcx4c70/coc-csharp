import * as fs from 'fs';
import { ExtensionContext, workspace } from 'coc.nvim';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { registerCommands } from './commands';

export async function activate(context: ExtensionContext): Promise<void> {
  if (workspace.getConfiguration('csharp').get<boolean>('enable') === false) {
    return;
  }

  const rootPath = context.storagePath;
  if (!fs.existsSync(rootPath)) {
    fs.mkdirSync(rootPath, { recursive: true });
  }

  const languageServer = await RoslynLanguageServer.initializeAsync(context);
  registerCommands(context, languageServer);

  await languageServer.checkUpdate();
}
