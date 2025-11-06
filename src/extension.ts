import * as vscode from 'vscode';

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

    } else {
      vscode.window.showErrorMessage('No active JSON editor found!');
    }
  });

  context.subscriptions.push(disposable);
}

// vere file ilott mattanam
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
      #toggle-columns-btn:hover {
        background-color: #005f9e;
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
        margin-bottom: 5px;
        white-space: nowrap;
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
        const jsonData = \`${escapedJson}\`;
        const rootData = JSON.parse(jsonData);
        
        const navigationStack = [
          { data: rootData, name: 'root' }
        ];

        // State Varibles
        let filterState = {};
        let sortState = { key: null, direction: 'asc' };
        let focusedInput = null;
        let hiddenColumns = new Set();
        let allHeaders = [];
        let isColumnsVisible = false;

        const breadcrumbContainer = document.getElementById('breadcrumbs');
        const tableContainer = document.getElementById('table-container');
        const controlsContainer = document.getElementById('controls-container');

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

        /**
         * Renders the breadcrumb navigation bar.
         */
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
        
        /**
         * Renders the controls area (e.g., Column Toggle button).
         */
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

        /**
         * Renders the given data (object or array) into the table container.
         */
        function renderData(data, originalData) {
          if (Array.isArray(originalData)) {
            tableContainer.innerHTML = buildTableFromArray(data, originalData);
          } else if (typeof originalData === 'object' && originalData !== null) {
            tableContainer.innerHTML = buildTableFromObject(data);
          } else {
            tableContainer.innerHTML = \`<pre>\${JSON.stringify(data, null, 2)}</pre>\`;
          }
        }
        
        /**
         * Filters the data based on the current filterState.
         */
        function applyFiltering(data) {
          if (!Array.isArray(data) || typeof data[0] !== 'object' || data[0] === null) {
            return data;
          }
          const filterKeys = Object.keys(filterState);
          if (filterKeys.length === 0) {
            return data;
          }
          return data.filter(item => {
            for (const key of filterKeys) {
              const filterText = filterState[key].toLowerCase();
              const itemValue = String(item[key] || '').toLowerCase();
              if (!itemValue.includes(filterText)) {
                return false;
              }
            }
            return true;
          });
        }

        /**
         * Sorts the data based on the current sortState.
         */
        function applySorting(data) {
          if (!Array.isArray(data) || sortState.key === null) {
            return data;
          }
          if (typeof data[0] !== 'object' || data[0] === null) {
            return data;
          }

          return data.slice().sort((a, b) => {
            const valA = a[sortState.key];
            const valB = b[sortState.key];
            const direction = (sortState.direction === 'asc') ? 1 : -1;

            if (valA === valB) return 0;
            if (valA === undefined || valA === null) return 1 * direction;
            if (valB === undefined || valB === null) return -1 * direction;
            if (typeof valA === 'number' && typeof valB === 'number') {
              return (valA - valB) * direction;
            }
            if (typeof valA === 'string' && typeof valB === 'string') {
              return valA.localeCompare(valB) * direction;
            }
            return String(valA).localeCompare(String(valB)) * direction;
          });
        }

        /**
         * Builds an HTML table from an array.
         */
        function buildTableFromArray(array, originalArray) {
          if (originalArray.length === 0) return "<p>Empty Array []</p>";

          let html = "<table>";
          const firstItem = originalArray[0];

          if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
            
            const visibleHeaders = allHeaders.filter(h => !hiddenColumns.has(h));
            
            html += "<tr><th class='key-cell'>(index)</th>";
            visibleHeaders.forEach(header => {
              let arrow = '';
              if (sortState.key === header) {
                arrow = (sortState.direction === 'asc') ? '▲' : '▼';
              }
              html += \`<th class="sortable-header" data-key="\${header}">
                        \${header} <span class="sort-arrow">\${arrow}</span>
                      </th>\`;
            });
            html += "</tr>";

            html += "<tr class='filter-row'><td class='key-cell'></td>";
            visibleHeaders.forEach(header => {
              html += \`<td>
                         <input type="text" class="filter-input" data-key="\${header}" placeholder="Filter...">
                       </td>\`;
            });
            html += "</tr>";

            if (array.length === 0) {
              html += \`<tr class="no-results-row">
                         <td colspan="\${visibleHeaders.length + 1}">No results found.</td>
                       </tr>\`;
            } else {
              array.forEach((item, index) => {
                html += "<tr>";
                html += \`<td class="key-cell">\${index}</td>\`;
                visibleHeaders.forEach(header => {
                  const value = (typeof item === 'object' && item !== null) ? item[header] : item;
                  html += \`<td>\${renderCell(value, \`data-index="\${index}" data-key="\${header}"\`)}</td>\`;
                });
                html += "</tr>";
              });
            }
          
          } else {
            html += "<tr><th class='key-cell'>(index)</th><th>(value)</th></tr>";
            array.forEach((item, index) => {
              html += "<tr>";
              html += \`<td class="key-cell">\${index}</td>\`;
              html += \`<td>\${renderCell(item, \`data-index="\${index}"\`)}</td>\`;
              html += "</tr>";
            });
          }

          html += "</table>";
          return html;
        }

        /**
         * Builds a 2-column (Key-Value) HTML table from a single object.
         */
        function buildTableFromObject(obj) {
          const keys = Object.keys(obj);
          if (keys.length === 0) return "<p>Empty Object {}</p>";

          let html = "<table>";
          keys.forEach(key => {
            html += "<tr>";
            html += \`<td class="key-cell">\${key}</td>\`;
            html += \`<td>\${renderCell(obj[key], \`data-key="\${key}"\`)}</td>\`;
            html += "</tr>";
          });
          html += "</table>";
          return html;
        }

        /**
         * Renders the content of a single cell, adding data attributes for clicks.
         */
        function renderCell(value, dataAttributes) {
          if (value === null) return "<i>null</i>";
          
          if (Array.isArray(value)) {
            return \`<span class="clickable-cell" \${dataAttributes}>[ Array(\${value.length}) ]</span>\`;
          } 
          
          if (typeof value === 'object' && value !== null) {
            return \`<span class="clickable-cell" \${dataAttributes}>[ Object ]</span>\`;
          }

          if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
             if (/\.(jpg|jpeg|png|gif|svg)$/i.test(value)) {
                return \`<img src="\${value}" alt="image" style="max-width: 100px; max-height: 100px;">\`;
             }
             return \`<a href="\${value}" target="_blank">\${value}</a>\`;
          }

          return value;
        }
        
        /**
         * Attaches click listeners to all clickable elements.
         */
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
          
          const toggleBtn = controlsContainer.querySelector('#toggle-columns-btn');
          if (toggleBtn) {
            toggleBtn.addEventListener('click', handleToggleColumnsClick);
          }
          
          controlsContainer.querySelectorAll('.column-toggle').forEach(checkbox => {
            checkbox.addEventListener('change', handleColumnToggleChange);
          });
        }
        
        /**
         * Handles the click event on a nested object/array cell.
         */
        function handleCellClick(e) {
          const target = e.target;
          const key = target.getAttribute('data-key');
          const index = target.getAttribute('data-index');
          
          const currentData = navigationStack[navigationStack.length - 1].data;
          
          let newData;
          let newName;

          if (index !== null && key !== null) {
            newData = currentData[index][key];
            newName = key;
          } else if (index !== null) {
            newData = currentData[index];
            newName = \`[\${index}]\`;
          } else if (key !== null) {
            newData = currentData[key];
            newName = key;
          } else {
            return;
          }
          
          sortState = { key: null, direction: 'asc' };
          filterState = {};
          hiddenColumns = new Set();
          allHeaders = [];
          isColumnsVisible = false;
          navigationStack.push({ data: newData, name: newName });
          render();
        }
        
        /**
         * Handles the click event on a sortable header.
         */
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
        
        /**
         * Handles the 'input' event on a filter text box.
         */
        function handleFilterInput(e) {
          const key = e.target.getAttribute('data-key');
          const value = e.target.value;
          
          if (value) {
            filterState[key] = value;
          } else {
            delete filterState[key];
          }
          
          focusedInput = { key: key, position: e.target.selectionStart };
          render();
        }
        
        /**
         * Handles clicking the 'Columns' button.
         */
        function handleToggleColumnsClick(e) {
          isColumnsVisible = !isColumnsVisible;
          render();
        }
        
        /**
         * Handles checking/unchecking a column toggle checkbox.
         */
        function handleColumnToggleChange(e) {
          const key = e.target.getAttribute('data-key');
          const isChecked = e.target.checked;
          
          if (isChecked) {
            hiddenColumns.delete(key);
          } else {
            hiddenColumns.add(key);
          }
          
          render();
        }

        render();

      }());
    </script>
</body>
</html>`;
}

/**
 * Generates an errpr message for invalkid json.
 */
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

// Deactivate aavambo
export function deactivate() { }