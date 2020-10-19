/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const log = console.log;
const error = console.log;
export const mochaHooks = {
    beforeEach() {
        if (process.env.FLUID_TEST_VERBOSE === undefined) {
            console.log = () => { };
            console.error = () => { };
        }
    },
    afterEach() {
        console.log = log;
        console.error = error;
    },
};
