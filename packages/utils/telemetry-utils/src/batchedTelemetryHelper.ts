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
type ICustomDataMap = Record<string, number>;
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
		private readonly threshold: number,
	) {}

	private incrementThresholdCount(): void {
		this.counter++;
	}

	private resetThresholdCount(): void {
		this.counter = 0;
	}

	private isAboveThreshold(): boolean {
		return this.counter >= this.threshold;
	}

	/**
	 * TODO
	 */
	public log(data: ICustomDataMap): void {
		for (const key of Object.keys(data)) {
			this.customDataMap.set(key, (this.customDataMap.get(key) ?? 0) + data[key]);
		}

		this.incrementThresholdCount();

		if (this.isAboveThreshold()) {
			this.sendData();
		}
	}

	public sendData(): void {
		const customData = Object.fromEntries(
			[...this.customDataMap.entries()].map(([key, value]) => [key, value / this.counter]),
		);

		// TODO: Add `average` name to the custom data.
		const telemetryEvent: ITelemetryPerformanceEventExt = {
			...this.eventBase,
			...customData,
		};

		this.logger.sendPerformanceEvent(telemetryEvent);
		this.resetThresholdCount();
	}

	public dispose(error?: Error | undefined): void {
		// TODO: Implement dispose method.
		// Not sure if calling `sendData()` for each entries (like `SampledTeelmetryHelper` does) is necessary.
		// We wish to accumulate the data over time and send it every `threshold` times.
		// Maybe instead `this.customMap.delete()` for each entries?
	}
}
