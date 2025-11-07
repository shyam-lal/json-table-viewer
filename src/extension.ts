import * as vscode from 'vscode';

// on start
export function activate(context: vscode.ExtensionContext) {

  let disposable = vscode.commands.registerCommand('json-table-viewer.showPreview', () => {

    const editor = vscode.window.activeTextEditor;

    if (editor) {
      const panel = vscode.window.createWebviewPanel(
        'jsonTablePreview',
        'JSON Table Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true
        }
      );

      const jsonContent = editor.document.getText();

      try {
        JSON.parse(jsonContent);
        panel.webview.html = getWebviewContent(jsonContent);
      } catch (e) {
        // panel.webview.html = getErrorWebviewContent(e.toString());
      }

      // handle edit
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
                } else {
                  vscode.window.showErrorMessage('Failed to apply edit.');
                }

              } catch (e) {
                vscode.window.showErrorMessage(`Error updating JSON: `);
              }
              return;
          }
        },
        undefined,
        context.subscriptions
      );

      // listener for manual text changes
      const onChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri === editor.document.uri) {
          try {
            const newContent = event.document.getText();
            JSON.parse(newContent); // Validate JSON
            panel.webview.postMessage({
              command: 'documentUpdated',
              newContent: newContent
            });
          } catch (e) {
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

// html for prevbuiew
function getWebviewContent(jsonContent: string): string {
  const escapedJson = jsonContent.replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Table Preview</title>
    <style>
      /* (All styles are unchanged) */
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        padding: 10px;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin-top: 10px;
      }
      th, td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }
      th {
        background-color: #f2f2f2;
        font-weight: 600;
      }
      .clickable-cell {
        color: #007acc;
        cursor: pointer;
        font-family: monospace;
      }
      .clickable-cell:hover {
        text-decoration: underline;
      }
      .key-cell {
        font-weight: 600;
        width: 20%;
      }
      #breadcrumbs {
        margin-bottom: 15px;
        font-size: 1.1em;
      }
      .breadcrumb-link {
        color: #007acc;
        cursor: pointer;
        text-decoration: none;
      }
      .breadcrumb-link:hover {
        text-decoration: underline;
      }
      .breadcrumb-separator {
        margin: 0 5px;
        color: #777;
      }
      .sortable-header {
        cursor: pointer;
      }
      .sortable-header:hover {
        background-color: #e8e8e8;
      }
      .sort-arrow {
        font-size: 0.8em;
        margin-left: 5px;
      }
      .filter-input {
        width: 95%;
        padding: 4px;
        border: 1px solid #ccc;
        border-radius: 4px;
      }
      .filter-row td {
        padding: 5px 8px;
        background-color: #f8f8f8;
      }
      .no-results-row td {
        text-align: center;
        font-style: italic;
        color: #777;
        padding: 15px;
      }
      #controls-container {
        margin-top: 15px;
      }
      #toggle-columns-btn {
        padding: 8px 12px;
        border: 1px solid #007acc;
        background-color: #007acc;
        color: white;
        border-radius: 4px;
        cursor: pointer;
      }
      #columns-container {
        border: 1px solid #ddd;
        padding: 10px;
        margin-top: 10px;
        border-radius: 4px;
        column-count: 4;
      }
      #columns-container label {
        display: block;
      }
      .editable-cell {
        cursor: text;
      }
      .editable-cell:hover {
        background-color: #f5f5f5;
      }
      [contenteditable="true"] {
        background-color: #fff;
        box-shadow: 0 0 2px 1px #007acc;
        outline: none;
      }
    </style>
</head>
<body>
    <h1>JSON Table Preview</h1>
    
    <div id="breadcrumbs"></div>
    <div id="controls-container"></div>
    <div id="table-container"></div>

    <script>
      (function() {
        const vscode = acquireVsCodeApi();
        
        let rootData = JSON.parse(\`${escapedJson}\`);
        
        const navigationStack = [
          { data: rootData, name: 'root' }
        ];

        // --- State Variables ---
        let filterState = {};
        let sortState = { key: null, direction: 'asc' };
        let focusedInput = null;
        let hiddenColumns = new Set();
        let allHeaders = [];
        let isColumnsVisible = false;

        const breadcrumbContainer = document.getElementById('breadcrumbs');
        const tableContainer = document.getElementById('table-container');
        const controlsContainer = document.getElementById('controls-container');
        
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'documentUpdated':
                    try {
                        rootData = JSON.parse(message.newContent);
                        navigationStack.splice(0, navigationStack.length, { data: rootData, name: 'root' });
                        filterState = {};
                        sortState = { key: null, direction: 'asc' };
                        focusedInput = null;
                        hiddenColumns = new Set();
                        allHeaders = [];
                        isColumnsVisible = false;

                        render();
                    } catch (e) {
                        console.error('Error parsing updated JSON from extension:', e);
                        tableContainer.innerHTML = \`<h2>Error syncing with file: \${e}</h2>\`;
                    }
                    break;
            }
        });

        /**
         * Renders the UI based on the *last* item in the navigationStack.
         */
        function render() {
          const currentView = navigationStack[navigationStack.length - 1];
          const currentData = currentView.data;
          
          renderBreadcrumbs();
          renderControls(currentData);
          
          const filteredData = applyFiltering(currentData);
          const sortedData = applySorting(filteredData);
          
          renderData(sortedData, currentData);
          
          attachClickListeners();
        }
        
        function renderBreadcrumbs() {
          breadcrumbContainer.innerHTML = '';
          navigationStack.forEach((item, index) => {
            if (index > 0) {
              breadcrumbContainer.innerHTML += \`<span class="breadcrumb-separator">&gt;</span>\`;
            }
            if (index === navigationStack.length - 1) {
              breadcrumbContainer.innerHTML += \`<b>\${item.name}</b>\`;
            } else {
              breadcrumbContainer.innerHTML += \`<a href="#" class="breadcrumb-link" data-index="\${index}">\${item.name}</a>\`;
            }
          });
          breadcrumbContainer.querySelectorAll('.breadcrumb-link').forEach(link => {
            link.addEventListener('click', (e) => {
              e.preventDefault();
              const index = parseInt(e.target.getAttribute('data-index'));
              navigationStack.splice(index + 1);
              sortState = { key: null, direction: 'asc' };
              filterState = {};
              hiddenColumns = new Set();
              allHeaders = [];
              isColumnsVisible = false;
              render();
            });
          });
        }
        
        function renderControls(data) {
          if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object' || data[0] === null) {
            controlsContainer.innerHTML = '';
            return;
          }
          if (allHeaders.length === 0) {
            const headers = new Set();
            data.forEach(item => {
              if (typeof item === 'object' && item !== null) {
                Object.keys(item).forEach(key => headers.add(key));
              }
            });
            allHeaders = Array.from(headers);
          }
          const displayStyle = isColumnsVisible ? 'block' : 'none';
          let html = \`<button id="toggle-columns-btn">Columns</button>
            <div id="columns-container" style="display: \${displayStyle};">\`;
          allHeaders.forEach(header => {
            const isChecked = !hiddenColumns.has(header);
            html += \`<label>
                       <input type="checkbox" class="column-toggle" data-key="\${header}" \${isChecked ? 'checked' : ''}>
                       \${header}
                     </label>\`;
          });
          html += \`</div>\`;
          controlsContainer.innerHTML = html;
        }

        function renderData(data, originalData) {
          if (Array.isArray(originalData)) {
            tableContainer.innerHTML = buildTableFromArray(data, originalData);
          } else if (typeof originalData === 'object' && originalData !== null) {
            tableContainer.innerHTML = buildTableFromObject(data);
          } else {
            tableContainer.innerHTML = \`<pre>\${JSON.stringify(data, null, 2)}</pre>\`;
          }
        }
        
        function applyFiltering(data) {
          if (!Array.isArray(data) || typeof data[0] !== 'object' || data[0] === null) { return data; }
          const filterKeys = Object.keys(filterState);
          if (filterKeys.length === 0) { return data; }
          return data.filter(item => {
            for (const key of filterKeys) {
              const filterText = filterState[key].toLowerCase();
              const itemValue = String(item[key] || '').toLowerCase();
              if (!itemValue.includes(filterText)) { return false; }
            }
            return true;
          });
        }

        function applySorting(data) {
          if (!Array.isArray(data) || sortState.key === null) { return data; }
          if (typeof data[0] !== 'object' || data[0] === null) { return data; }
          return data.slice().sort((a, b) => {
            const valA = a[sortState.key];
            const valB = b[sortState.key];
            const direction = (sortState.direction === 'asc') ? 1 : -1;
            if (valA === valB) return 0;
            if (valA === undefined || valA === null) return 1 * direction;
            if (valB === undefined || valB === null) return -1 * direction;
            if (typeof valA === 'number' && typeof valB === 'number') { return (valA - valB) * direction; }
            if (typeof valA === 'string' && typeof valB === 'string') { return valA.localeCompare(valB) * direction; }
            return String(valA).localeCompare(String(valB)) * direction;
          });
        }
        
        function isPrimitive(value) {
          return value === null || (typeof value !== 'object' && !Array.isArray(value));
        }

        function renderCell(value) {
          if (value === null) return "<i>null</i>";
          if (Array.isArray(value)) return \`[ Array(\${value.length}) ]\`;
          if (typeof value === 'object') return \`[ Object ]\`;
          if (typeof value === 'string') {
             if (/\.(jpg|jpeg|png|gif|svg)$/i.test(value)) {
                return \`<img src="\${value}" alt="image" style="max-width: 100px; max-height: 100px;">\`;
             }
             if (value.startsWith('http://') || value.startsWith('https://')) {
                return \`<a href="\${value}" target="_blank">\${value}</a>\`;
             }
             return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          }
          return value;
        }

        function buildTableFromArray(array, originalArray) {
          if (originalArray.length === 0) return "<p>Empty Array []</p>";
          let html = "<table>";
          const firstItem = originalArray[0];
          if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
            const visibleHeaders = allHeaders.filter(h => !hiddenColumns.has(h));
            html += "<tr><th class='key-cell'>(index)</th>";
            visibleHeaders.forEach(header => {
              let arrow = '';
              if (sortState.key === header) { arrow = (sortState.direction === 'asc') ? '▲' : '▼'; }
              html += \`<th class="sortable-header" data-key="\${header}">\${header} <span class="sort-arrow">\${arrow}</span></th>\`;
            });
            html += "</tr>";
            html += "<tr class='filter-row'><td class='key-cell'></td>";
            visibleHeaders.forEach(header => {
              html += \`<td><input type="text" class="filter-input" data-key="\${header}" placeholder="Filter..."></td>\`;
            });
            html += "</tr>";
            if (array.length === 0) {
              html += \`<tr class="no-results-row"><td colspan="\${visibleHeaders.length + 1}">No results found.</td></tr>\`;
            } else {
              array.forEach((item, index) => {
                html += "<tr>";
                html += \`<td class="key-cell">\${index}</td>\`;
                visibleHeaders.forEach(header => {
                  const value = (typeof item === 'object' && item !== null) ? item[header] : undefined;
                  const displayValue = renderCell(value);
                  if (isPrimitive(value)) {
                    html += \`<td class="editable-cell" data-index="\${index}" data-key="\${header}">\${displayValue}</td>\`;
                  } else {
                    html += \`<td class="clickable-cell" data-index="\${index}" data-key="\${header}">\${displayValue}</td>\`;
                  }
                });
                html += "</tr>";
              });
            }
          } else {
            html += "<tr><th class'key-cell'>(index)</th><th>(value)</th></tr>";
            array.forEach((item, index) => {
              html += "<tr>";
              html += \`<td class="key-cell">\${index}</td>\`;
              const displayValue = renderCell(item);
              if (isPrimitive(item)) {
                html += \`<td class="editable-cell" data-index="\${index}">\${displayValue}</td>\`;
              } else {
                html += \`<td class="clickable-cell" data-index="\${index}">\${displayValue}</td>\`;
              }
              html += "</tr>";
            });
          }
          html += "</table>";
          return html;
        }

        function buildTableFromObject(obj) {
          const keys = Object.keys(obj);
          if (keys.length === 0) return "<p>Empty Object {}</p>";
          let html = "<table>";
          keys.forEach(key => {
            html += "<tr>";
            html += \`<td class="key-cell">\${key}</td>\`;
            const value = obj[key];
            const displayValue = renderCell(value);
            if (isPrimitive(value)) {
              html += \`<td class="editable-cell" data-key="\${key}">\${displayValue}</td>\`;
            } else {
              html += \`<td class="clickable-cell" data-key="\${key}">\${displayValue}</td>\`;
            }
            html += "</tr>";
          });
          html += "</table>";
          return html;
        }
        
        function attachClickListeners() {
          tableContainer.querySelectorAll('.clickable-cell').forEach(cell => {
            cell.addEventListener('click', handleCellClick);
          });
          tableContainer.querySelectorAll('.sortable-header').forEach(header => {
            header.addEventListener('click', handleSortClick);
          });
          tableContainer.querySelectorAll('.filter-input').forEach(input => {
            const key = input.getAttribute('data-key');
            input.value = filterState[key] || '';
            input.addEventListener('input', handleFilterInput);
            if (focusedInput && focusedInput.key === key) {
              input.focus();
              input.selectionStart = focusedInput.position;
              input.selectionEnd = focusedInput.position;
            }
          });
          focusedInput = null;
          controlsContainer.querySelector('#toggle-columns-btn')?.addEventListener('click', handleToggleColumnsClick);
          controlsContainer.querySelectorAll('.column-toggle').forEach(checkbox => {
            checkbox.addEventListener('change', handleColumnToggleChange);
          });
          tableContainer.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('dblclick', handleCellDoubleClick);
          });
        }
        
        /**
         * Handles the clicl evnt on a nested object/array.
         */
        function handleCellClick(e) {
          const target = e.target.closest('td');
          const key = target.getAttribute('data-key');
          const index = target.getAttribute('data-index');
          
          const currentData = navigationStack[navigationStack.length - 1].data;

          // Reset state for *any* navigation
          sortState = { key: null, direction: 'asc' };
          filterState = {};
          hiddenColumns = new Set();
          allHeaders = [];
          isColumnsVisible = false;

          if (index !== null && key !== null) { 
            const objectData = currentData[index];
            const objectName = \`[\${index}]\`;
            navigationStack.push({ data: objectData, name: objectName });
            
            const finalData = objectData[key];
            const finalName = key;
            navigationStack.push({ data: finalData, name: finalName });
            
          } else if (index !== null) { 
            const finalData = currentData[index]; 
            const finalName = \`[\${index}]\`; 
            navigationStack.push({ data: finalData, name: finalName });
            
          } else if (key !== null) { 
            const finalData = currentData[key]; 
            const finalName = key; 
            navigationStack.push({ data: finalData, name: finalName });
            
          } else { 
            return;
          }
          
          render();
        }
        
        function handleSortClick(e) {
          const newKey = e.currentTarget.getAttribute('data-key');
          if (sortState.key === newKey) {
            sortState.direction = (sortState.direction === 'asc') ? 'desc' : 'asc';
          } else {
            sortState.key = newKey;
            sortState.direction = 'asc';
          }
          render();
        }
        
        function handleFilterInput(e) {
          const key = e.target.getAttribute('data-key');
          const value = e.target.value;
          if (value) { filterState[key] = value; } 
          else { delete filterState[key]; }
          focusedInput = { key: key, position: e.target.selectionStart };
          render();
        }
        
        function handleToggleColumnsClick(e) {
          isColumnsVisible = !isColumnsVisible;
          render();
        }
        
        function handleColumnToggleChange(e) {
          const key = e.target.getAttribute('data-key');
          const isChecked = e.target.checked;
          if (isChecked) { hiddenColumns.delete(key); } 
          else { hiddenColumns.add(key); }
          render();
        }

        let originalCellValue = null;

        function handleCellDoubleClick(e) {
          const cell = e.currentTarget;
          if (cell.isContentEditable) return;
          originalCellValue = cell.innerText;
          cell.setAttribute('contenteditable', 'true');
          cell.focus();
          document.execCommand('selectAll', false, null);
          cell.addEventListener('blur', handleCellBlur);
          cell.addEventListener('keydown', handleCellKeydown);
        }

        function handleCellBlur(e) {
          const cell = e.currentTarget;
          cell.setAttribute('contenteditable', 'false');
          cell.removeEventListener('blur', handleCellBlur);
          cell.removeEventListener('keydown', handleCellKeydown);
          const newValue = cell.innerText;
          if (newValue !== originalCellValue) {
            sendUpdate(cell, newValue);
          }
        }

        function handleCellKeydown(e) {
          const cell = e.currentTarget;
          if (e.key === 'Enter') {
            e.preventDefault();
            cell.blur();
          } else if (e.key === 'Escape') {
            cell.innerText = originalCellValue;
            cell.blur();
          }
        }

        function sendUpdate(cell, newValue) {
          const key = cell.getAttribute('data-key');
          const index = cell.getAttribute('data-index');
          const path = navigationStack.map(item => item.name);
          
          vscode.postMessage({
            command: 'updateValue',
            path: path,
            key: key,
            index: index,
            newValue: newValue
          });
        }

        render();

      }());
    </script>
</body>
</html>`;
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
    <pre style="color: red;">\${error}</pre>
</body>
</html>`;
}

export function deactivate() { }