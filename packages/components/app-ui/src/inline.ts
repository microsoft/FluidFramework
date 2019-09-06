/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Box, BoxContext, BoxKind, BoxState } from "./box";

// Inline elements participate in line layout.
export abstract class Inline<TSelf extends BoxState> extends Box<TSelf> {
    constructor() {
        super(BoxKind.Inline);
    }

    // Returns min/max horizontal dimensions.
    public measure(self: TSelf, context: BoxContext): { min: number, max: number } {
        return this.measuring(self, context);
    }

    // Implemented by Inline subclasses to calculate their min/max horizontal dimensions.
    protected abstract measuring(self: TSelf, context: BoxContext): { min: number, max: number };
}
