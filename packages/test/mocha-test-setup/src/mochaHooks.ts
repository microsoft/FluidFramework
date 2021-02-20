/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

const log = console.log;
const error = console.log;
export const mochaHooks = {
    beforeEach() {
        if (process.env.FLUID_TEST_VERBOSE === undefined) {
            console.log = () => { };
            console.error = () => { };
        }

        const _global: any = global;
        if (_global.getTestLogger?.() === undefined) {
            const nullLogger: ITelemetryBufferedLogger = { send: () => {}, flush: () => {} };
            _global.getTestLogger = () => nullLogger;
        }
    },
    afterEach() {
        console.log = log;
        console.error = error;
        //* Todo - Does this work? :P no ...need the same instance...
        getTestLogger().flush().catch(() => {});
    },
};
