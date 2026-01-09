/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CommonProperties,
	ThrottlingTelemetryProperties,
} from "@fluidframework/server-services-telemetry";

export function getThrottlingBaseTelemetryProperties(key?: string): {
	baseMessageMetaData: {
		key: string | undefined;
		eventName: string;
	};
	baseLumberjackProperties: {
		[CommonProperties.telemetryGroupName]: string;
		[ThrottlingTelemetryProperties.key]: string | undefined;
	};
} {
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
