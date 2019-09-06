/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {Box, BoxKind, BoxState } from "./box";

export abstract class Block<TSelf extends BoxState> extends Box<TSelf> {
    constructor() {
        super(BoxKind.Block);
    }
}
