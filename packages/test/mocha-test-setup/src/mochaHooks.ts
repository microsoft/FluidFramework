/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";

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
            //* Switch to BaseTelemetryNullLogger from common-utils
            const nullLogger: ITelemetryBaseLogger = { send: () => {} };
            _global.getTestLogger = () => nullLogger;
        }
    },
    afterEach() {
        console.log = log;
        console.error = error;
    },
};
