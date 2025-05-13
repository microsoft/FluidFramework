/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "./performanceIsomorphic.js";

/**
 * Helper class for tracing performance of events
 * Time measurements are in milliseconds as a floating point with a decimal
 *
 * @internal
 */
export class Trace {
	public static start(): Trace {
		const startTick = performanceNow();
		return new Trace(startTick);
	}

	protected lastTick: number;
	protected constructor(public readonly startTick: number) {
		this.lastTick = startTick;
	}

	public trace(): ITraceEvent {
		const tick = performanceNow();
		const event = {
			totalTimeElapsed: tick - this.startTick,
			duration: tick - this.lastTick,
			tick,
		};
		this.lastTick = tick;
		return event;
	}
}

/**
 * Event in a performance trace including time elapsed.
 *
 * @internal
 */
export interface ITraceEvent {
	/**
	 * Total time elapsed since the start of the Trace.
	 * Measured in milliseconds as a floating point with a decimal
	 */
	readonly totalTimeElapsed: number;
	/**
	 * Time elapsed since the last trace event.
	 * Measured in milliseconds as a floating point with a decimal
	 */
	readonly duration: number;
	/**
	 * This number represents a relative time which should
	 * be consistent for all trace ticks.
	 */
	readonly tick: number;
}
