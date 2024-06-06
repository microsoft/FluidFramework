/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { IDisposable } from "@fluidframework/core-interfaces";

import type {
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
} from "./telemetryTypes.js";

/**
 * TODO
 */
interface ICustomDataMap {
	[key: string]: number;
}

/**
 * TODO
 */
export class BatchedTelemetryHelper implements IDisposable {
	disposed: boolean = false;

	// Stores value of the custom data passed into the logger.
	private readonly customDataMap: Map<string, number> = new Map<string, number>();
	// Counter to keep track of the number of times the log function is called.
	private counter = 0;

	/**
	 * TODO
	 */
	public constructor(
		private readonly eventBase: ITelemetryGenericEventExt,
		private readonly logger: ITelemetryLoggerExt,
		private readonly sampleThreshold: number,
	) {}

	private incrementThresholdCount(): void {
		this.counter++;
	}

	private isAboveThreshold(): boolean {
		return this.counter >= this.sampleThreshold;
	}

	/**
	 * TODO
	 */
	public log(data: ICustomDataMap): void {
		for (const key of Object.keys(data)) {
			if (Object.prototype.hasOwnProperty.call(this.customDataMap, key)) {
				this.customDataMap[key] += data[key];
			} else {
				this.customDataMap[key] = data[key];
			}
		}

		this.incrementThresholdCount();

		if (this.isAboveThreshold()) {
			const telemetryEvent: ITelemetryPerformanceEventExt = {
				...this.eventBase,
			};

			this.logger.sendPerformanceEvent(telemetryEvent);
		}
	}

	public dispose(error?: Error | undefined): void {
		throw new Error("Method not implemented.");
	}
}
