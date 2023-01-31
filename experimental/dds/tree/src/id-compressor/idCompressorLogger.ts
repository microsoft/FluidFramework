/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITelemetryBaseEvent,
	ITelemetryErrorEvent,
	ITelemetryGenericEvent,
	ITelemetryLogger,
	ITelemetryPerformanceEvent,
} from '@fluidframework/common-definitions';

export class IdCompressorLogger implements ITelemetryLogger {
	public constructor(private readonly logger: ITelemetryLogger, private readonly sendEvents: boolean) {}
	send(event: ITelemetryBaseEvent): void {
		if (this.sendEvents) {
			this.logger.send(event);
		}
	}
	sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any): void {
		if (this.sendEvents) {
			this.logger.sendTelemetryEvent(event, error);
		}
	}
	sendErrorEvent(event: ITelemetryErrorEvent, error?: any): void {
		if (this.sendEvents) {
			this.logger.sendErrorEvent(event, error);
		}
	}
	sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void {
		if (this.sendEvents) {
			this.logger.sendPerformanceEvent(event, error);
		}
	}

	supportsTags?: true | undefined;
}
