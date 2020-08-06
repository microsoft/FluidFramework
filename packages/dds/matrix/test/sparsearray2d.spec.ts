/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import 'mocha';

import { SparseArray2D } from '../src/sparsearray2d';
import { fill, check } from './utils';

describe('SparseArray2D', () => {
    it('read/write top-left 256x256', () => {
        const a = new SparseArray2D();
        fill(a, /* rowStart: */ 0, /* colStart: */ 0, /* rowCount: */ 256, /* colCount: */ 256);
        check(a, /* rowStart: */ 0, /* colStart: */ 0, /* rowCount: */ 256, /* colCount: */ 256);
    });

    it('read/write bottom-right 256x256', () => {
        const a = new SparseArray2D();
        fill(a, /* rowStart: */ 0, /* colStart: */ 0, /* rowCount: */ 256, /* colCount: */ 256);
        check(a, /* rowStart: */ 0, /* colStart: */ 0, /* rowCount: */ 256, /* colCount: */ 256);

        fill(a,  /* rowStart: */ 0xffffff00, /* colStart: */ 0xffffff00, /* rowCount: */ 256, /* colCount: */ 256);
        check(a, /* rowStart: */ 0xffffff00, /* colStart: */ 0xffffff00, /* rowCount: */ 256, /* colCount: */ 256);
    });
});
