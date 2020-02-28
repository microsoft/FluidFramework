/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockRuntime } from '@microsoft/fluid-test-runtime-utils';
import { SharedMatrix, SharedMatrixFactory } from './imports';
import { strict as assert } from 'assert';
import { insertFragmented } from '../../test/utils';
const process = require('process');

let count = 1;
let cached: any;

/**
 * Paranoid defense against dead code elimination.
 */
export function consume(value: any) {
  count++;
  if (count >>> 0 === 0) {
    cached = value;
  }
}

// Prevent v8's optimizer from identifying 'cached' as an unused value.
process.on('exit', () => {
  if (count >>> 0 === 0) {
    console.log(`Ignore this: ${cached}`);
  }
});

export function randomId() {
  // tslint:disable-next-line:insecure-random
  return Math.random()
    .toString(36)
    .slice(2);
}

export function createContiguousMatrix(numRows: number, numCols: number) {
  const runtime = new MockRuntime();
  const matrix = new SharedMatrixFactory().create(runtime, randomId()) as SharedMatrix;
  matrix.insertRows(0, numRows);
  matrix.insertCols(0, numCols);
  return matrix;
}

export function createFragmentedMatrix(numRows: number, numCols: number) {
  const runtime = new MockRuntime();
  const matrix = new SharedMatrixFactory().create(runtime, randomId()) as SharedMatrix;

  insertFragmented(matrix, numRows, numCols);

  assert.equal(matrix.numRows, numRows);
  assert.equal(matrix.numCols, numCols);

  return matrix;
}
