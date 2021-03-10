/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

const _global: any = global;
const nullLogger: ITelemetryBufferedLogger = { send: () => {}, flush: async () => {} };

const log = console.log;
const error = console.log;
export const mochaHooks = {
    beforeAll() {
        // Ensure getTestLogger is defined
        if (_global.getTestLogger?.() === undefined) {
            _global.getTestLogger = () => nullLogger;
        }
    },
    beforeEach() {
        // Suppress console.log if not verbose mode
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
