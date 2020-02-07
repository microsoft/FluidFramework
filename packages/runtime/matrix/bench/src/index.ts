/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { run } from './harness';

(async () => {
  console.group('Empty');
  await run([
    { path: './src/read/nativearray', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: false } },
    { path: './src/read/map', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: false } },
    { path: './src/read/sparsearray2d', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: false } },
    { path: './src/read/matrix/contiguous', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: false } },
    { path: './src/read/matrix/fragmented', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: false } },
    { path: './src/read/tiled', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: false } }
  ]);
  console.groupEnd();

  console.group('Populated');
  await run([
    { path: './src/read/nativearray', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: true } },
    { path: './src/read/map', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: true } },
    { path: './src/read/sparsearray2d', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: true } },
    { path: './src/read/matrix/contiguous', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: true } },
    { path: './src/read/matrix/fragmented', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: true } },
    { path: './src/read/tiled', args: { row: 0, col: 0, numRows: 256, numCols: 256, fill: true } }
  ]);
  console.groupEnd();
})().catch(console.log.bind(console));
