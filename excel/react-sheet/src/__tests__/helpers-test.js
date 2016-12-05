'use strict';
//const jest = require('jest');
//const expect = require('expect');

jest.dontMock('../helpers');

const Helpers = require('../helpers');

describe('Helpers', () => {
  it('Correctly finds the first element in an array', () => {
    let arr = [{myProp: 1}, {myProp: 2}, {myProp: 3, xProp: 1}, {myProp: 4}, {myProp: 3, xProp: 2}];

    let firstFound = Helpers.firstInArray(arr, function (element) {
      return (element.myProp === 3);
    });

    expect(firstFound.myProp).toBe(3);
    expect(firstFound.xProp).toBe(1);
  });

  it('Correctly finds the first element in an array', () => {
    let arr = [{nodeName: 'x'}, {nodeName: 'TD', myProp: 1}, {nodeName: 'TD', myProp: 2}];

    let firstFound = Helpers.firstTDinArray(arr);

    expect(firstFound.nodeName).toBe('TD');
    expect(firstFound.myProp).toBe(1);
  });

  it('Correctly identifies two cells as equal', () => {
    let cell1 = ['prop', 'propTwo'];
    let cell2 = ['prop', 'propTwo'];

    let cellsEqual = Helpers.equalCells(cell1, cell2);

    expect(cellsEqual).toBe(true);
  });

  it('Correctly identifies two cells as unequal', () => {
    let cell1 = ['prop', 'propTwo'];
    let cell2 = ['prop', 'propThree'];

    let cellsEqual = Helpers.equalCells(cell1, cell2);

    expect(cellsEqual).toBe(false);
  });

  it('Correctly counts with letters', () => {
    expect(Helpers.countWithLetters(1)).toBe('A');
    expect(Helpers.countWithLetters(2)).toBe('B');
    expect(Helpers.countWithLetters(26)).toBe('Z');
    expect(Helpers.countWithLetters(27)).toBe('AA');
    expect(Helpers.countWithLetters(28)).toBe('AB');
  });

  it('Correctly makes a spreadsheet id', () => {
    expect(Helpers.makeSpreadsheetId().length).toBe(5);
    expect(Helpers.makeSpreadsheetId().length).toBe(5);
    expect(Helpers.makeSpreadsheetId().length).toBe(5);
    expect(Helpers.makeSpreadsheetId().length).toBe(5);
  });
});
