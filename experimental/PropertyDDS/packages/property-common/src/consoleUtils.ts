/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Used to replace console.assert to make sure that it always throws an error, both in the browser and in Node
 */

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ConsoleUtils {
    /**
     * Throws an error if the in_condition is false
     * @param  in_condition the condition we are testing: a boolean expression.
     * @param  in_message the error message that will be thrown if the condition is false.
     */
    static assert(in_condition: boolean, in_message: string) {
        if (!in_condition) {
            throw new Error(in_message);
        }
    }
}
