/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { run } from "hotloop";

(async () => {
    console.group("Populated");
    await run([
        // { path: "./src/read/nativearray", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: true } },
        // { path: "./src/read/map", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: true } },
        { path: "./src/read/sparsearray2d", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: true } },
        { path: "./src/read/matrix/contiguous", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: true } },
        { path: "./src/read/matrix/fragmented", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: true } },
        // { path: "./src/read/tiled", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: true } }
    ]);
    console.groupEnd();

    console.group("Empty");
    await run([
        // { path: "./src/read/nativearray", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: false } },
        // { path: "./src/read/map", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: false } },
        { path: "./src/read/sparsearray2d", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: false } },
        { path: "./src/read/matrix/contiguous", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: false } },
        { path: "./src/read/matrix/fragmented", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: false } },
        // { path: "./src/read/tiled", args: { row: 0, col: 0, rowCount: 256, colCount: 256, fill: false } }
    ]);
    console.groupEnd();
})();
