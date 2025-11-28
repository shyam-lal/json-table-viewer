(function () {
    // vscode api
    const vscode = acquireVsCodeApi();

    // get json
    let rootData = JSON.parse(document.body.getAttribute('data-json'));

    const navigationStack = [
        { data: rootData, name: 'root' }
    ];

    // state variables
    let filterState = {};
    let sortState = { key: null, direction: 'asc' };
    let focusedInput = null;
    let hiddenColumns = new Set();
    let allHeaders = [];
    let isColumnsVisible = false;

    // View Mode State
    let viewMode = 'table'; // 'table' | 'tree'

    // Search state
    let searchMatches = [];
    let currentMatchIndex = -1;

    const breadcrumbContainer = document.getElementById('breadcrumbs');
    const tableContainer = document.getElementById('table-container');
    const treeContainer = document.getElementById('tree-container');
    const controlsContainer = document.getElementById('controls-container');

    const showSearchBtn = document.getElementById('show-search-btn');
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');
    const searchCounter = document.getElementById('search-counter');
    const searchPrevBtn = document.getElementById('search-prev-btn');
    const searchNextBtn = document.getElementById('search-next-btn');
    const searchCloseBtn = document.getElementById('search-close-btn');

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
                    tableContainer.innerHTML = `<h2>Error syncing with file: ${e}</h2>`;
                }
                break;
        }
    });

    function render() {
        clearSearch();
        const currentView = navigationStack[navigationStack.length - 1];
        const currentData = currentView.data;

        renderBreadcrumbs();
        renderControls(currentData);

        if (viewMode === 'table') {
            tableContainer.style.display = 'block';
            treeContainer.style.display = 'none';

            const filteredData = applyFiltering(currentData);
            const sortedData = applySorting(filteredData);
            renderData(sortedData, currentData);
            attachClickListeners(); // For Table
        } else {
            tableContainer.style.display = 'none';
            treeContainer.style.display = 'block';

            treeContainer.innerHTML = '';
            const treeRoot = document.createElement('ul');
            treeRoot.className = 'tree-root';

            const itemLi = buildTreeItem(undefined, rootData, ['root']);
            treeRoot.appendChild(itemLi);
            treeContainer.appendChild(treeRoot);

            attachTreeListeners();
        }
    }

    function renderBreadcrumbs() {
        breadcrumbContainer.innerHTML = '';
        navigationStack.forEach((item, index) => {
            if (index > 0) {
                breadcrumbContainer.innerHTML += `<span class="breadcrumb-separator">&gt;</span>`;
            }
            if (index === navigationStack.length - 1) {
                breadcrumbContainer.innerHTML += `<b>${item.name}</b>`;
            } else {
                breadcrumbContainer.innerHTML += `<a href="#" class="breadcrumb-link" data-index="${index}">${item.name}</a>`;
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
            // todo: logic for empty data
        }

        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && allHeaders.length === 0) {
            const headers = new Set();
            data.forEach(item => {
                if (typeof item === 'object' && item !== null) {
                    Object.keys(item).forEach(key => headers.add(key));
                }
            });
            allHeaders = Array.from(headers);
        }

        const displayStyle = isColumnsVisible ? 'block' : 'none';
        const isTable = viewMode === 'table';

        let html = ``;

        if (isTable) {
            html += `<button id="export-csv-btn" class="control-btn">Export to CSV</button>
                     <button id="export-xlsx-btn" class="control-btn">Export to XLSX</button>
                     <button id="toggle-columns-btn" class="control-btn">Columns</button>`;
        }

        html += `<div class="toggle-container">
                    <div id="view-mode-table" class="toggle-option ${isTable ? 'selected' : ''}">
                        Table
                    </div>
                    <div id="view-mode-tree" class="toggle-option ${!isTable ? 'selected' : ''}">
                        Tree
                    </div>
                 </div>`;

        if (isTable) {
            html += `<div id="columns-container" style="display: ${displayStyle}; width: 100%;">`;
            const allChecked = hiddenColumns.size === 0;
            html += `<label style="font-weight: bold; display: block;">
                    <input type="checkbox" id="toggle-all-columns-btn" ${allChecked ? 'checked' : ''}>
                    ALL
                    </label>
                    <hr style="margin: 8px 0;">`;

            html += `<div id="column-checkbox-list">`;
            allHeaders.forEach(header => {
                const isChecked = !hiddenColumns.has(header);
                html += `<label>
                        <input type="checkbox" class="column-toggle" data-key="${header}" ${isChecked ? 'checked' : ''}>
                        ${header}
                        </label>`;
            });
            html += `</div>`;
            html += `</div>`;
        }

        controlsContainer.innerHTML = html;

        if (isTable) {
            controlsContainer.querySelector('#toggle-columns-btn')?.addEventListener('click', handleToggleColumnsClick);
            controlsContainer.querySelectorAll('.column-toggle').forEach(checkbox => {
                checkbox.addEventListener('change', handleColumnToggleChange);
            });
            controlsContainer.querySelector('#toggle-all-columns-btn')?.addEventListener('change', handleToggleAllColumnsChange);
            controlsContainer.querySelector('#export-csv-btn')?.addEventListener('click', handleExportCsvClick);
            controlsContainer.querySelector('#export-xlsx-btn')?.addEventListener('click', handleExportXlsxClick);
        }

        // Attach View Mode listeners
        document.getElementById('view-mode-table').addEventListener('click', () => {
            if (viewMode !== 'table') {
                viewMode = 'table';
                render();
            }
        });
        document.getElementById('view-mode-tree').addEventListener('click', () => {
            if (viewMode !== 'tree') {
                viewMode = 'tree';
                render();
            }
        });
    }

    function buildTreeItem(key, value, path) {
        const li = document.createElement('li');
        li.className = 'tree-item';

        const isObj = typeof value === 'object' && value !== null;
        const isArray = Array.isArray(value);
        const isStructure = isObj || isArray;

        const toggler = document.createElement('span');
        toggler.className = 'tree-toggler';
        if (isStructure) {
            toggler.innerHTML = '&#9654;';
            toggler.addEventListener('click', (e) => {
                e.stopPropagation();
                const childUl = li.querySelector('ul');
                if (childUl) {
                    const isClosed = childUl.style.display === 'none';
                    childUl.style.display = isClosed ? 'block' : 'none';
                    toggler.classList.toggle('down', isClosed);
                }
            });
        } else {
            toggler.classList.add('leaf');
        }
        li.appendChild(toggler);

        // Key display
        if (key !== undefined && key !== null) {
            const keySpan = document.createElement('span');
            keySpan.className = 'tree-key';
            keySpan.textContent = key + ': ';
            li.appendChild(keySpan);
        }

        // Value display
        if (isStructure) {
            const summary = document.createElement('span');
            summary.className = 'tree-val-array-label';
            if (isArray) {
                summary.textContent = `Array(${value.length})`;
            } else {
                summary.textContent = '{ ... }';
            }
            li.appendChild(summary);

            const ul = document.createElement('ul');
            ul.className = 'tree-nested';
            ul.style.display = 'none';

            const keys = Object.keys(value);
            keys.forEach(k => {
                let nextPath;
                if (isArray) {
                    nextPath = [...path, `[${k}]`];
                } else {
                    nextPath = [...path, k];
                }
                ul.appendChild(buildTreeItem(k, value[k], nextPath));
            });
            li.appendChild(ul);

            const toggleFn = () => {
                const isClosed = ul.style.display === 'none';
                ul.style.display = isClosed ? 'block' : 'none';
                toggler.classList.toggle('down', isClosed);
            };
            summary.addEventListener('click', toggleFn);

        } else {
            const valSpan = document.createElement('span');
            let displayVal = JSON.stringify(value);
            if (value === undefined) displayVal = 'undefined';

            valSpan.classList.add('tree-val-editable');
            if (typeof value === 'string') {
                valSpan.classList.add('tree-val-string');
            } else if (typeof value === 'number') {
                valSpan.classList.add('tree-val-number');
            } else if (typeof value === 'boolean') {
                valSpan.classList.add('tree-val-bool');
            } else {
                valSpan.classList.add('tree-val-null');
            }

            valSpan.textContent = displayVal;
            valSpan.setAttribute('data-path', JSON.stringify(path));

            li.appendChild(valSpan);
        }

        return li;
    }

    function attachTreeListeners() {
        treeContainer.querySelectorAll('.tree-val-editable').forEach(span => {
            span.addEventListener('dblclick', handleTreeValueDoubleClick);
        });
    }

    let originalTreeValue = null;

    function handleTreeValueDoubleClick(e) {
        const span = e.currentTarget;
        if (span.isContentEditable) return;

        originalTreeValue = span.innerText;
        span.setAttribute('contenteditable', 'true');
        span.focus();
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(span);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        span.addEventListener('blur', handleTreeValueBlur);
        span.addEventListener('keydown', handleTreeValueKeydown);
    }

    function handleTreeValueBlur(e) {
        const span = e.currentTarget;
        span.setAttribute('contenteditable', 'false');
        span.removeEventListener('blur', handleTreeValueBlur);
        span.removeEventListener('keydown', handleTreeValueKeydown);

        const newValue = span.innerText;
        if (newValue !== originalTreeValue) {
            sendTreeUpdate(span, newValue);
        }
    }

    function handleTreeValueKeydown(e) {
        const span = e.currentTarget;
        if (e.key === 'Enter') {
            e.preventDefault();
            span.blur();
        } else if (e.key === 'Escape') {
            span.innerText = originalTreeValue;
            span.blur();
        }
    }

    function sendTreeUpdate(span, newValue) {
        const pathJson = span.getAttribute('data-path');
        if (!pathJson) return;

        const fullPath = JSON.parse(pathJson);

        if (fullPath.length === 0) return;

        const targetSegment = fullPath[fullPath.length - 1];
        const parentPath = fullPath.slice(0, fullPath.length - 1);

        let key = null;
        let index = null;

        const indexMatch = targetSegment.match(/^\[(\d+)\]$/);
        if (indexMatch) {
            index = parseInt(indexMatch[1], 10);
        } else {
            key = targetSegment;
        }

        vscode.postMessage({
            command: 'updateValue',
            path: parentPath,
            key: key,
            index: index,
            newValue: newValue
        });
    }


    function renderData(data, originalData) {
        if (Array.isArray(originalData)) {
            tableContainer.innerHTML = buildTableFromArray(data, originalData);
        } else if (typeof originalData === 'object' && originalData !== null) {
            tableContainer.innerHTML = buildTableFromObject(data);
        } else {
            tableContainer.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
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
        if (Array.isArray(value)) return `[ Array(${value.length}) ]`;
        if (typeof value === 'object') return `[ Object ]`;
        if (typeof value === 'string') {
            if (/\.(jpg|jpeg|png|gif|svg)$/i.test(value)) {
                return `<img src="${value}" alt="image" style="max-width: 100px; max-height: 100px;">`;
            }
            if (value.startsWith('http://') || value.startsWith('https://')) {
                return `<a href="${value}" target="_blank">${value}</a>`;
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
                html += `<th class="sortable-header" data-key="${header}">${header} <span class="sort-arrow">${arrow}</span></th>`;
            });
            html += "</tr>";
            html += "<tr class='filter-row'><td class='key-cell'></td>";
            visibleHeaders.forEach(header => {
                html += `<td><input type="text" class="filter-input control-input" data-key="${header}" placeholder="Filter..."></td>`;
            });
            html += "</tr>";
            if (array.length === 0) {
                html += `<tr class="no-results-row"><td colspan="${visibleHeaders.length + 1}">No results found.</td></tr>`;
            } else {
                array.forEach((item, index) => {
                    html += "<tr>";
                    html += `<td class="key-cell">${index}</td>`;
                    visibleHeaders.forEach(header => {
                        const value = (typeof item === 'object' && item !== null) ? item[header] : undefined;
                        const displayValue = renderCell(value);
                        if (isPrimitive(value)) {
                            html += `<td class="editable-cell" data-index="${index}" data-key="${header}">${displayValue}</td>`;
                        } else {
                            html += `<td class="clickable-cell" data-index="${index}" data-key="${header}">${displayValue}</td>`;
                        }
                    });
                    html += "</tr>";
                });
            }
        } else {
            html += "<tr><th class'key-cell'>(index)</th><th>(value)</th></tr>";
            array.forEach((item, index) => {
                html += "<tr>";
                html += `<td class="key-cell">${index}</td>`;
                const displayValue = renderCell(item);
                if (isPrimitive(item)) {
                    html += `<td class="editable-cell" data-index="${index}">${displayValue}</td>`;
                } else {
                    html += `<td class="clickable-cell" data-index="${index}">${displayValue}</td>`;
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
            html += `<td class="key-cell">${key}</td>`;
            const value = obj[key];
            const displayValue = renderCell(value);
            if (isPrimitive(value)) {
                html += `<td class="editable-cell" data-key="${key}">${displayValue}</td>`;
            } else {
                html += `<td class="clickable-cell" data-key="${key}">${displayValue}</td>`;
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
        controlsContainer.querySelector('#toggle-all-columns-btn')?.addEventListener('change', handleToggleAllColumnsChange);
        tableContainer.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('dblclick', handleCellDoubleClick);
        });
        controlsContainer.querySelector('#export-csv-btn')?.addEventListener('click', handleExportCsvClick);
        controlsContainer.querySelector('#export-xlsx-btn')?.addEventListener('click', handleExportXlsxClick);
    }

    function handleCellClick(e) {
        const target = e.target.closest('td');
        const key = target.getAttribute('data-key');
        const index = target.getAttribute('data-index');
        const currentData = navigationStack[navigationStack.length - 1].data;
        sortState = { key: null, direction: 'asc' };
        filterState = {};
        hiddenColumns = new Set();
        allHeaders = [];
        isColumnsVisible = false;
        if (index !== null && key !== null) {
            const objectData = currentData[index];
            const objectName = `[${index}]`;
            navigationStack.push({ data: objectData, name: objectName });
            const finalData = objectData[key];
            const finalName = key;
            navigationStack.push({ data: finalData, name: finalName });
        } else if (index !== null) {
            const finalData = currentData[index];
            const finalName = `[${index}]`;
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

    function handleToggleAllColumnsChange(e) {
        const isChecked = e.target.checked;
        if (isChecked) {
            hiddenColumns.clear();
        } else {
            allHeaders.forEach(header => hiddenColumns.add(header));
        }
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

    function handleExportCsvClick() {
        const currentData = navigationStack[navigationStack.length - 1].data;
        const filteredData = applyFiltering(currentData);
        const sortedData = applySorting(filteredData);
        const visibleHeaders = allHeaders.filter(h => !hiddenColumns.has(h));
        const csvString = generateCsv(visibleHeaders, sortedData);
        vscode.postMessage({
            command: 'exportToCsv',
            csvString: csvString
        });
    }

    function generateCsv(headers, data) {
        const quoteValue = (value) => {
            if (value === null || value === undefined) {
                return '';
            }
            if (typeof value === 'object' || Array.isArray(value)) {
                value = JSON.stringify(value);
            }
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };
        let csv = '';
        csv += headers.map(quoteValue).join(',') + '\n';
        data.forEach(row => {
            csv += headers.map(header => {
                return quoteValue(row[header]);
            }).join(',') + '\n';
        });
        return csv;
    }

    function handleExportXlsxClick() {
        const currentData = navigationStack[navigationStack.length - 1].data;
        const filteredData = applyFiltering(currentData);
        const sortedData = applySorting(filteredData);
        const visibleHeaders = allHeaders.filter(h => !hiddenColumns.has(h));

        vscode.postMessage({
            command: 'exportToXlsx',
            data: sortedData,
            headers: visibleHeaders
        });
    }

    // Search fns

    function showSearch() {
        showSearchBtn.style.display = 'none';
        searchContainer.style.display = 'flex';
        searchInput.focus();
        searchInput.select();
    }

    function hideSearch() {
        searchContainer.style.display = 'none';
        showSearchBtn.style.display = 'block';
        clearSearch();
    }

    function clearSearch() {
        searchMatches.forEach(cell => {
            cell.classList.remove('search-highlight');
            cell.classList.remove('search-highlight-current');
        });
        searchMatches = [];
        currentMatchIndex = -1;
        searchCounter.textContent = '0 / 0';
        if (searchContainer.style.display === 'none') {
            showSearchBtn.style.display = 'block';
        }
    }

    function performSearch() {
        const query = searchInput.value;
        clearSearch();
        if (query.length === 0) {
            return;
        }

        const queryLower = query.toLowerCase();
        const cells = tableContainer.querySelectorAll('td, th');

        cells.forEach(cell => {
            if (cell.querySelector('input.filter-input')) {
                return;
            }
            if (cell.innerText.toLowerCase().includes(queryLower)) {
                cell.classList.add('search-highlight');
                searchMatches.push(cell);
            }
        });

        if (searchMatches.length > 0) {
            currentMatchIndex = 0;
            updateCurrentMatchHighlight();
        }
        updateSearchCounter();
    }

    function updateCurrentMatchHighlight() {
        searchMatches.forEach((cell, index) => {
            if (index === currentMatchIndex) {
                cell.classList.add('search-highlight-current');
                cell.classList.remove('search-highlight');
                cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            } else {
                cell.classList.remove('search-highlight-current');
                cell.classList.add('search-highlight');
            }
        });
    }

    function updateSearchCounter() {
        if (searchMatches.length === 0) {
            searchCounter.textContent = '0 / 0';
        } else {
            searchCounter.textContent = `${currentMatchIndex + 1} / ${searchMatches.length}`;
        }
    }

    function navigateToNextMatch() {
        if (searchMatches.length === 0) return;
        currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
        updateCurrentMatchHighlight();
        updateSearchCounter();
    }

    function navigateToPrevMatch() {
        if (searchMatches.length === 0) return;
        currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
        updateCurrentMatchHighlight();
        updateSearchCounter();
    }

    // Search event (cacncel pinne cheyyam)

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            showSearch();
        }
        if (e.key === 'Escape') {
            if (searchContainer.style.display === 'flex') {
                hideSearch();
            }
        }
    });

    // Search button (pinne mattam)
    showSearchBtn.addEventListener('click', showSearch);

    searchInput.addEventListener('input', performSearch);

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                navigateToPrevMatch();
            } else {
                navigateToNextMatch();
            }
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateToNextMatch();
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateToPrevMatch();
        }
    });

    searchNextBtn.addEventListener('click', navigateToNextMatch);
    searchPrevBtn.addEventListener('click', navigateToPrevMatch);
    searchCloseBtn.addEventListener('click', hideSearch);

    //
    // Search end

    render();

}());