import * as xlsx from 'xlsx';

export function isPrimitive(value: any) {
    return value === null || (typeof value !== 'object' && !Array.isArray(value));
}


export function buildSmartWorkbook(data: any[], headers: string[]): Buffer {
    const wb = xlsx.utils.book_new();
    const mainSheet: any[] = [];

    const subSheets: { [key: string]: any[] } = {};
    const subSheetHeaders: { [key: string]: Set<string> } = {};

    data.forEach((row, index) => {
        const rowId = index + 1;
        const mainRow: any = { _rowId: rowId };

        for (const header of headers) {
            const value = row[header];
            const safeSheetName = header.substring(0, 31);

            if (isPrimitive(value)) {
                mainRow[header] = value;

            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                mainRow[header] = {
                    v: `[View: ${header}]`,
                    t: 's',
                    l: { Target: `'${safeSheetName}'!A1` }
                };

                if (!subSheets[header]) {
                    subSheets[header] = [];
                    subSheetHeaders[header] = new Set();
                }
                const subRow = { _rowId: rowId, ...value };
                subSheets[header].push(subRow);
                Object.keys(value).forEach(k => subSheetHeaders[header].add(k));

            } else if (Array.isArray(value)) {
                if (value.length === 0) {
                    mainRow[header] = "[]"; // Empty array
                    continue;
                }
                mainRow[header] = {
                    v: `[View: ${header} (${value.length})]`,
                    t: 's',
                    l: { Target: `'${safeSheetName}'!A1` }
                };

                if (!subSheets[header]) {
                    subSheets[header] = [];
                    subSheetHeaders[header] = new Set();
                }

                const firstItem = value[0];

                if (isPrimitive(firstItem)) {
                    subSheetHeaders[header].add("value");
                    value.forEach((v: any) => {
                        subSheets[header].push({ _rowId: rowId, value: v });
                    });
                } else {
                    value.forEach((v: any) => {
                        const subRow = { _rowId: rowId, ...v };
                        subSheets[header].push(subRow);
                        Object.keys(v).forEach(k => subSheetHeaders[header].add(k));
                    });
                }
            }
        }
        mainSheet.push(mainRow);
    });

    const mainWs = xlsx.utils.json_to_sheet(mainSheet, { header: ["_rowId", ...headers] });

    mainWs['!links'] = [];
    mainSheet.forEach((row, r) => {
        headers.forEach((header, c) => {
            if (row[header] && row[header].l) {
                const cellAddress = xlsx.utils.encode_cell({ r: r + 1, c: c + 1 });
                mainWs[cellAddress].l = row[header].l;
            }
        });
    });

    xlsx.utils.book_append_sheet(wb, mainWs, "Main");

    for (const sheetName in subSheets) {
        const sheetHeaders = Array.from(subSheetHeaders[sheetName]);
        const ws = xlsx.utils.json_to_sheet(subSheets[sheetName], {
            header: ["_rowId", ...sheetHeaders.filter(h => h !== '_rowId')]
        });
        const safeSheetName = sheetName.substring(0, 31);
        xlsx.utils.book_append_sheet(wb, ws, safeSheetName);
    }

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}