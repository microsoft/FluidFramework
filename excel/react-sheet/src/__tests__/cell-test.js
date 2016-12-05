'use strict';
//const jest = require('jest');

jest.dontMock('../cell');

const React = require('react');
const ReactDOM = require('react-dom');
const TestUtils = require('react-addons-test-utils');

const CellComponent = require('../cell');

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
