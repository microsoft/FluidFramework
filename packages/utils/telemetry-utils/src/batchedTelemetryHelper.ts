/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type {
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
} from "./telemetryTypes.js";

/**
 * Expected type of the custom data passed into the logger.
 */
type ICustomDataMap = Record<string, number>;

/**
 * Helper class that accumulates user defined telemetry metrics {@link ICustomDataMap} and sends it to the {@link  ITelemetryLoggerExt} logger provided to this class every time the `{@link BatchedTelemetryHelper.log)` function is called reaches a number specified by the `threshold` value to this classes' constructor.
 */
export class TelemetryEventBatcher {
	// Stores value of the custom data passed into the logger.
	private readonly customDataMap: Map<string, number> = new Map<string, number>();
	// Counter to keep track of the number of times the log function is called.
	private counter = 0;

	public constructor(
		/**
		 * Custom properties to include in the telemetry performance event when it is written.
		 */
		private readonly eventBase: ITelemetryGenericEventExt,

		/**
		 * The logger to use to write the telemetry performance event.
		 */
		private readonly logger: ITelemetryLoggerExt,

		/**
		 * The number of logs to accumulate before sending the data to the logger.
		 */
		private readonly threshold: number,
	) {}

	/**
	 * Accumulates the custom data and sends it to the logger every time the number of logs reaches the threshold by calling `sendData()`.
	 *
	 * @param customData -
	 * A record storing the custom data to be logged.
	 */
	public log(customData: ICustomDataMap): void {
		for (const key of Object.keys(customData)) {
			this.customDataMap.set(key, (this.customDataMap.get(key) ?? 0) + customData[key]);
		}

		this.counter++;

		if (this.counter >= this.threshold) {
			this.sendData();
		}
	}

	private sendData(): void {
		const customData = Object.fromEntries(
			[...this.customDataMap.entries()].map(([key, value]) => [key, value / this.counter]),
		);

		// TODO: Add `average` name to the custom data.
		const telemetryEvent: ITelemetryPerformanceEventExt = {
			...this.eventBase,
			...customData,
		};

		this.logger.sendPerformanceEvent(telemetryEvent);
		this.counter = 0;
	}
}
