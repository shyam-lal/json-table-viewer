# JSON Table Editor for VS Code

<!-- [![Version](https://img.shields.io/visual-studio-marketplace/v/your-publisher-id.json-table-viewer)](https://marketplace.visualstudio.com/items?itemName=your-publisher-id.json-table-viewer)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/your-publisher-id.json-table-viewer)](https://marketplace.visualstudio.com/items?itemName=your-publisher-id.json-table-viewer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) -->

Stop squinting at raw, minified JSON. This extension provides a simple, interactive table view for your `.json` files, complete with editing, filtering, and powerful export tools.

<!-- ![GIF of the JSON Table Editor in action](https...placeholder-for-your-demo-gif...png) -->

## Why?

Working with large JSON arrays (like API responses or data dumps) is a pain. It's hard to read, hard to compare items, and almost impossible to edit safely. This tool provides a clean, spreadsheet-like interface to make that process simple, all without leaving VS Code.

## Features

* **⚡ Two-Way Editing:** The killer feature. Edit a value in the table, press Enter, and your `.json` file is **instantly updated and reformatted**. It works both ways—edit the text file, and the table view syncs automatically.
* **Navigate Nested Data:** Don't just see `[Object]` or `[Array]`. Click on any nested item to "drill down" and open it in a new, fully interactive table with breadcrumbs.
* **Analyze Data Quickly:**
    * **Sort** any column (A-Z, Z-A, 1-9, 9-1).
    * **Filter** by any column to find the data you need.
    * **Show/Hide Columns** to hide noisy data and focus on what matters.
* **Smart Export Tools:**
    * **Export to CSV:** Instantly export your current filtered/sorted view to a `.csv` file.
    * **Smart Export to XLSX:** Generates a relational, multi-sheet Excel file. Nested objects (`address`) and arrays (`tags`, `friends`) are automatically "un-nested" into their own sheets with a `_rowId` to link them back to the main data.
* **Theme Aware:** The UI automatically adapts to your current VS Code theme for a native, clean look.
* **Zero-Config:** Just open a `.json` file and click the icon.

## How to Use

1.  Open any `.json` or `.jsonc` file in VS Code.
2.  Click the "Preview JSON as Table" icon (a small table) in the editor's title bar.
3.  That's it. Your data is now in an interactive table.

## Feedback & Contributing

Find a bug? Have a feature request? Feel free to [open an issue](https://github.com/shyam-lal/json-table-viewer/issues) on the GitHub repo.

## License

[MIT](https://opensource.org/licenses/MIT)