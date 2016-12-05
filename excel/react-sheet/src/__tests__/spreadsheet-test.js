'use strict';
//const jest = require('jest');
//const expect = require('expect');
jest.dontMock('../spreadsheet');

const React = require('react');
const ReactDOM = require('react-dom');
const TestUtils = require('react-addons-test-utils');

const SpreadsheetComponent = require('../spreadsheet');

const testVars = {
  initialData: {
    rows: [
        ['', '', '', '', '', '', '', ''],
        ['', 1, 2, 3, 4, 5, 6, 7],
        ['', 1, '', 3, 4, 5, 6, 7],
        ['', 1, 2, 3, 4, 5, 6, 7],
        ['', 1, 2, 3, 4, 5, 6, 7]
    ]
  },
  config: {
    rows: 5,
    columns: 8,
    hasHeadColumn: true,
    isHeadColumnString: true,
    hasHeadRow: true,
    isHeadRowString: true,
    canAddRow: true,
    canAddColumn: true,
    emptyValueSymbol: '-',
    hasLetterNumberHeads: true
  }
};

describe('Spreadsheet', () => {
  it('Renders a spreadsheet', () => {
    const spreadsheet = TestUtils.renderIntoDocument(
       <SpreadsheetComponent
          initialData={testVars.initialData}
          config={testVars.config}
          cellClasses={testVars.cellClasses} />
    );

    const spreadsheetNode = ReactDOM.findDOMNode(spreadsheet);
    expect(spreadsheetNode).toBeDefined();
  });
});
