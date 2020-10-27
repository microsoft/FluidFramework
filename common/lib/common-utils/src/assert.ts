/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A browser friendly version of the node assert library. Use this instead of the 'assert' package, which has a big
 * impact on bundle sizes.
 * @param condition - The condition that should be truthy, if the condition is falsy an error will be thrown.
 * @param message - The message to include in the error when the condition does not hold
 */
 export function assert(condition: any, message?: string) {
     if (!condition) {
         throw new Error(message);
     }
 }
