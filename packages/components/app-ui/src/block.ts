/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {Box, BoxKind, BoxState } from "./box";

export function isBlock<T extends BoxState>(maybeBox: Box<T> | undefined): maybeBox is Block<T> {
    return (maybeBox !== undefined) && (maybeBox.boxKind === BoxKind.Block);
}

export abstract class Block<TSelf extends BoxState> extends Box<TSelf> {
    constructor() {
        super(BoxKind.Block);
    }
}
