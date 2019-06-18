/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";

export function assertThrows(fn: () => void) {
    try {
        fn();
        assert.ok(false);
    } catch {
        assert.ok(true);
    }
}
