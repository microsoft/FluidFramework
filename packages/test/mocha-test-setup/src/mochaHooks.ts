/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { Context } from "mocha";

const _global: any = global;
const context = this as any as Context;
const nullLogger: ITelemetryBufferedLogger = { send: () => {}, flush: async () => {} };

const log = console.log;
const error = console.log;

export const mochaHooks = {
    beforeAll() {
        // Ensure getTestLogger is defined
        if (_global.getTestLogger?.() === undefined) {
            _global.getTestLogger = () => nullLogger;
        }
        else {
            const baseLogger = _global.getTestLogger;
            const properties = { all: { testName: context.currentTest?.fullTitle() } };
            const combinedProperties = {} as any;
            for(const extendedProps of [baseLogger.properties, properties]) {
                if(extendedProps !== undefined) {
                    if(extendedProps.all !== undefined) {
                        combinedProperties.all = {
                            ... combinedProperties.all,
                            ... extendedProps.all,
                        };
                    }
                    if(extendedProps.error !== undefined) {
                        combinedProperties.error = {
                            ... combinedProperties.error,
                            ... extendedProps.error,
                        };
                    }
                }
            }
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
