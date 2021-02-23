/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

const _global: any = global;
const nullLogger: ITelemetryBufferedLogger = { send: () => {}, flush: () => {} };

// can be async or not
export const mochaGlobalSetup = function() {
    // Ensure getTestLogger is defined even if no hook sets it up purposefully
    if (_global.getTestLogger?.() === undefined) {
        _global.getTestLogger = (_singleton) => nullLogger;  //* Is it ok to ignore _singleton here?
    }
};

const log = console.log;
const error = console.log;
export const mochaHooks = {
    beforeAll() {
    },
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
    async afterAll() {
        // Flush the logs before exiting
        getTestLogger(true /* singleton */).flush();
        // Apparently it takes some time after the sync call returns to actually get the data off the box
        await (new Promise((res) => { setTimeout(res, 1000); }));
    },
};
