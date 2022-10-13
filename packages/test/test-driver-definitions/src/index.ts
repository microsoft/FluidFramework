/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBufferedLogger } from "./interfaces";

declare global {

    /** This function may be provided by the environment, like a mocha test hook or dynamic import */
    export const getTestLogger: (() => ITelemetryBufferedLogger) | undefined;
}

export {
	DriverEndpoint,
	ITelemetryBufferedLogger,
	ITestDriver,
	OdspEndpoint,
	RouterliciousEndpoint,
	TestDriverTypes,
} from "./interfaces";
