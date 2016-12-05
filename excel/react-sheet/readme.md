## Spreadsheet Component for React
[![Build Status](https://travis-ci.org/felixrieseberg/React-Spreadsheet-Component.svg?branch=master)](https://travis-ci.org/felixrieseberg/React-Spreadsheet-Component) [![Dependency Status](https://david-dm.org/felixrieseberg/react-spreadsheet-component.svg)](https://david-dm.org/felixrieseberg/react-spreadsheet-component) [![npm version](https://badge.fury.io/js/react-spreadsheet-component.svg)](https://badge.fury.io/js/react-spreadsheet-component) ![Downloads](https://img.shields.io/npm/dm/react-spreadsheet-component.svg)

This is a spreadsheet component built in Facebook's ReactJS. [You can see a demo here](http://felixrieseberg.github.io/React-Spreadsheet-Component/).

![Screenshot](https://raw.githubusercontent.com/felixrieseberg/React-Spreadsheet-Component/master/example/.reactspreadsheet.gif)
![Screenshot](https://raw.githubusercontent.com/felixrieseberg/React-Spreadsheet-Component/master/example/.reactspreadsheet2.gif)

## Usage
The component is initialized with a configuration object. If desired, initial data for the spreadsheet can be passed in as an array of rows. In addition, you can pass in a second array filled with class names for each cell, allowing you to style each cell differently.

```js
var SpreadsheetComponent = require('react-spreadsheet-component');
React.render(<SpreadsheetComponent initialData={initialData} config={config} spreadsheetId="1" />, document.getElementsByTagName('body'));
```

##### Configuration Object
```js
var config = {
    // Initial number of row
    rows: 5,
    // Initial number of columns
    columns: 8,
    // True if the first column in each row is a header (th)
    hasHeadColumn: true,
    // True if the data for the first column is just a string.
    // Set to false if you want to pass custom DOM elements.
    isHeadColumnString: true,
    // True if the first row is a header (th)
    hasHeadRow: true,
    // True if the data for the cells in the first row contains strings.
    // Set to false if you want to pass custom DOM elements.
    isHeadRowString: true,
    // True if the user can add rows (by navigating down from the last row)
    canAddRow: true,
    // True if the user can add columns (by navigating right from the last column)
    canAddColumn: true,
    // Override the display value for an empty cell
    emptyValueSymbol: '-',
    // Fills the first column with index numbers (1...n) and the first row with index letters (A...ZZZ)
    hasLetterNumberHeads: true
};
```

##### Initial Data Object
The initial data object contains an array `rows`, which itself contains an array for every single row. Each index in the array represents a cell. It is used by the component to pre-populate the cells with data. Be aware that user input is not written to this object, as it is merely used in initialization to populate the state. If you want to capture user input, read below.

```js
var data = {
    rows: [
        ['Key', 'AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG'],
        ['COM', '0,0', '0,1', '0,2', '0,3', '0,4', '0,5', '0,6'],
        ['DIV', '1,0', '1,1', '1,2', '1,3', '1,4', '1,5', '1,6'],
        ['DEV', '2,0', '2,1', '2,2', '2,3', '2,4', '2,5', '2,6'],
        ['ACC', '3,0', '3,1', '3,2', '3,3', '3,4', '3,5', '3,6']
    ]
};
```

##### Cell Classes Object
You can assign custom classes to individual cells. Follow the same schema as for the initial data object.

```js
var classes = {
    rows: [
        ['', 'specialHead', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', 'error', '', '', '', '', '', ''],
        ['', 'error changed', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '']
    ]
};
```

## Data Lifecycle
User input is not written to the `initialData` object, as it is merely used in initialization to populate the state. If you want to capture user input, subscribe callbacks to the `cellValueChanged` and `dataChanged` events on the dispatcher.

The last parameter is the `spreadsheetId` of the spreadsheet you want to subscribe to.

##### Get the full data state after each change
```js
var Dispatcher = require('./src/dispatcher');

Dispatcher.subscribe('dataChanged', function (data) {
    // data: The entire new data state
}, "spreadsheet-1")
```
##### Get the data change before state change
```js
var Dispatcher = require('./src/dispatcher');

Dispatcher.subscribe('cellValueChanged', function (cell, newValue, oldValue) {
    // cell: An array indicating the cell position by row/column, ie: [1,1]
    // newValue: The new value for that cell
}, "spreadsheet-1")
```

### Other Dispatcher Events
The dispatcher offers some other events you can subscribe to:
 * `headCellClicked` A head cell was clicked (returns a cell array `[row, column]`)
 * `cellSelected` A cell was selected (returns a cell array `[row, column]`)
 * `cellBlur` A cell was blurred (returns returns a cell array `[row, column]`)
 * `editStarted` The user started editing (returns a cell array `[row, column]`)
 * `editStopped` The user stopped editing (returns a cell array `[row, column]`)
 * `newRow` The user created a new row (returns the row index)
 * `newColumn` The user created a new column (returns the row index)

## Running the Example
Clone the repository from GitHub and open the created folder:


Install npm packages and compile JSX
```bash
npm install
gulp
```

Eslint is run automatically when you type 'gulp'. To check lint errors, do 'npm run lint'.

If you are using Windows, run the following commands instead:
```bash
npm install --msvs_version=2013
gulp
```

