/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { asdfqwermfields } from '@fluidframework/common-definitions';
import { ITelemetryLoggerExt } from '@fluidframework/telemetry-utils';
import { ITelemetryLoggerExt } from '@fluidframework/telemetry-utils';
import { TelemetryNullLogger } from '@fluidframework/telemetry-utils';

/**
 * Because the IdCompressor emits so much telemetry, this function is used to sample
 * based on the sessionId. Only the given percentage of sessions will emit telemetry.
 *
 * @param logger - The logger that will be used to send the events if sampled.
 * @param percentage - A percentage (in decimal) of clients that should send events.
 * @returns The original logger or the null logger that doesn't send events.
 */
export function createThrottledIdCompressorLogger(
	logger: ITelemetryLoggerExt,
	percentage: number
): ITelemetryLoggerExt {
	const sendEvents = Math.random() < percentage;
	return sendEvents ? logger : new TelemetryNullLogger();
}
