import * as vscode from 'vscode';
import { Buffer } from 'buffer';
import * as fs from 'fs';
// import * as path from 'path';
import { buildSmartWorkbook } from './exportLogic';

export function activate(context: vscode.ExtensionContext) {

  let disposable = vscode.commands.registerCommand('json-table-viewer.showPreview', () => {

    const editor = vscode.window.activeTextEditor;

    if (editor) {
      const panel = vscode.window.createWebviewPanel(
        'jsonTablePreview',
        'JSON Table Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')]
        }
      );

      const jsonContent = editor.document.getText();

      try {
        JSON.parse(jsonContent);
        panel.webview.html = getWebviewContent(panel.webview, context, jsonContent);
      } catch (e: any) {
        panel.webview.html = getErrorWebviewContent(e.toString());
      }

      // Handle msg from the prview
      panel.webview.onDidReceiveMessage(
        async message => {
          switch (message.command) {
            case 'updateValue':
              if (!editor) {
                vscode.window.showErrorMessage('No active editor to update.');
                return;
              }
              try {
                const document = editor.document;
                const json = JSON.parse(document.getText());
                let target = json;
                const navPath = message.path.slice(1);
                for (const segment of navPath) {
                  if (Array.isArray(target) && segment.startsWith('[') && segment.endsWith(']')) {
                    const index = parseInt(segment.substring(1, segment.length - 1));
                    target = target[index];
                  } else {
                    target = target[segment];
                  }
                }
                let coercedValue;
                try {
                  coercedValue = JSON.parse(message.newValue);
                } catch (e) {
                  coercedValue = message.newValue;
                }
                if (message.index !== null && message.key !== null) {
                  target[message.index][message.key] = coercedValue;
                } else if (message.index !== null) {
                  target[message.index] = coercedValue;
                } else if (message.key !== null) {
                  target[message.key] = coercedValue;
                }
                const newJsonString = JSON.stringify(json, null, 2);
                const fullRange = new vscode.Range(
                  document.positionAt(0),
                  document.positionAt(document.getText().length)
                );
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, fullRange, newJsonString);
                const success = await vscode.workspace.applyEdit(edit);
                if (success) {
                  panel.webview.postMessage({
                    command: 'documentUpdated',
                    newContent: newJsonString
                  });
                }
              } catch (e: any) {
                vscode.window.showErrorMessage(`Error updating JSON: ${e.message}`);
              }
              return;

            case 'exportToCsv':
              try {
                const uri = await vscode.window.showSaveDialog({
                  filters: { 'CSV': ['csv'] },
                  defaultUri: vscode.Uri.file('export.csv')
                });
                if (uri) {
                  const buffer = Buffer.from(message.csvString, 'utf8');
                  await vscode.workspace.fs.writeFile(uri, buffer);
                  vscode.window.showInformationMessage('CSV exported successfully!');
                }
              } catch (e: any) {
                vscode.window.showErrorMessage(`Error exporting CSV: ${e.message}`);
              }
              return;

            case 'exportToXlsx':
              try {
                const data = message.data;
                const headers = message.headers;

                const buffer = buildSmartWorkbook(data, headers);

                const uri = await vscode.window.showSaveDialog({
                  filters: { 'Excel Workbook': ['xlsx'] },
                  defaultUri: vscode.Uri.file('export.xlsx')
                });

                if (uri) {
                  await vscode.workspace.fs.writeFile(uri, Buffer.from(buffer));
                  vscode.window.showInformationMessage('XLSX exported successfully!');
                }

              } catch (e: any) {
                vscode.window.showErrorMessage(`Error exporting XLSX: ${e.message}`);
              }
              return;
          }
        },
        undefined,
        context.subscriptions
      );

      // manual chang listner
      const onChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri === editor.document.uri) {
          try {
            const newContent = event.document.getText();
            JSON.parse(newContent);
            panel.webview.postMessage({
              command: 'documentUpdated',
              newContent: newContent
            });
          } catch (e) {
            // Pinne ndelm add cheyyam
          }
        }
      });

      // Cleanup listeners
      panel.onDidDispose(() => {
        onChangeListener.dispose();
      }, null, context.subscriptions);

    } else {
      vscode.window.showErrorMessage('No active JSON editor found!');
    }
  });

  context.subscriptions.push(disposable);
}


function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext, jsonContent: string): string {

  const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'main.html');
  const scriptPath = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'main.js');
  const stylePath = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'main.css');

  const scriptUri = webview.asWebviewUri(scriptPath);
  const styleUri = webview.asWebviewUri(stylePath);

  const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};`;

  let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

  html = html.replace('__CSP_SOURCE__', csp);
  html = html.replace('__SCRIPT_URI__', scriptUri.toString());
  html = html.replace('__STYLE_URI__', styleUri.toString());

  const escapedJson = jsonContent
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/>/g, '&gt;');

  html = html.replace('__JSON_DATA__', escapedJson);
  return html;
}

function getErrorWebviewContent(error: string): string {
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>JSON Error</title>
    </head>
    <body>
      <h1>Error Parsing JSON</h1>
      <p>Please fix the errors in your JSON file and try again.</p>
      <pre style="color: red;">${error}</pre>
    </body>
    </html>`;
}

export function deactivate() { }