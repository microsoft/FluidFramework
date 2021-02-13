/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidError } from "./fluidError";

export class AssertError extends FluidError {
    constructor(
        errorMessage: string,
        readonly errorType: string,
    ) {
        super(errorMessage);
    }
}

/**
 * A browser friendly version of the node assert library. Use this instead of the 'assert' package, which has a big
 * impact on bundle sizes.
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * @param message - The message to include in the error when the condition does not hold
 */
 export function simpleAssert(condition: boolean, message?: string): asserts condition {
     if (!condition) {
         throw new AssertError(message ?? "simpleAssert", "simpleAssert");
     }
 }

 /**
 * A browser friendly version of the node assert library. Use this instead of the 'assert' package, which has a big
 * impact on bundle sizes.
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * @param message - The message to include in the error when the condition does not hold
 */
export function assert(condition: boolean, message: string, errorType: string): asserts condition {
    if (!condition) {
        throw new AssertError(message, errorType);
    }
}
