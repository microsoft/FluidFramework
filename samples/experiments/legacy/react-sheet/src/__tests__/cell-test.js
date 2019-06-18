/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

jest.unmock('../cell');

import React from 'react';
import ReactDOM from 'react-dom';
import TestUtils from 'react-addons-test-utils';

import CellComponent from '../cell';

const testVars =  {
  key: 'row_0000_cell_1',
  uid: [0, 0],
  val: 'test',
  spreadsheetId: '1',
  selected: false,
  editing: false
};

describe('Cell', () => {
  it('Renders a cell', () => {
    const cell = TestUtils.renderIntoDocument(
      <table>
        <tbody>
          <tr>
            <CellComponent
              uid={testVars.uid}
              key={testVars.key}
              value={testVars.val}
              spreadsheetId={testVars.spreadsheetId}
              selected={testVars.selected}
              editing={testVars.editing}
            />
          </tr>
        </tbody>
      </table>
    );

    ReactDOM.findDOMNode(cell);
  });
});
