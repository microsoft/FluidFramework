/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

jest.unmock('../row');

import React from 'react';
import ReactDOM from 'react-dom';
import TestUtils from 'react-addons-test-utils';

import RowComponent from '../row';

const testVars = {
  cellClasses: [],
  uid: 0,
  key: 'testkey',
  spreadsheetId: '0',
  className: 'rowComponent',
  cells: ['', 1, 2, 3, 4, 5, 6, 7],
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

describe('Row', () => {
  it('Renders a row', () => {
    const row = TestUtils.renderIntoDocument(
      <table>
        <tbody>
            <RowComponent
              config = {testVars.config}
              cells={testVars.cells}
              cellClasses={testVars.cellClasses}
              uid={testVars.uid}
              key={testVars.key}
              spreadsheetId={testVars.spreadsheetId}
              className={testVars.className}
            />
        </tbody>
      </table>
    );

    const rowNode = ReactDOM.findDOMNode(row);
    expect(rowNode).toBeDefined();
  });
});
