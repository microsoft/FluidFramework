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
    afterAll() {
        // Flush the logs before
        getTestLogger(true /* singleton */).flush();
    },
};
