/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CommonProperties,
	ThrottlingTelemetryProperties,
} from "@fluidframework/server-services-telemetry";

export function getThrottlingBaseTelemetryProperties(key?: string) {
	return {
		baseMessageMetaData: {
			key,
			eventName: "throttling",
		},
		baseLumberjackProperties: {
			[CommonProperties.telemetryGroupName]: "throttling",
			[ThrottlingTelemetryProperties.key]: key,
		},
	};
}
