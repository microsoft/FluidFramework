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
        fill(a);
        check(a);
    });

    it('read/write bottom-right 256x256', () => {
        const a = new SparseArray2D();
        fill(a);
        check(a);

        fill(a, 0xffffff00, 0xffffff00);
        check(a, 0xffffff00, 0xffffff00);
    });
});
