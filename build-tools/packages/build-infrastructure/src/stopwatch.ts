/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultLogger } from "./logging.js";

/**
 * A stopwatch used for outputting messages to the terminal along with timestamp information.
 * The stopwatch is started upon creation, and each call to `log` will include the recorded time.
 */
export class Stopwatch {
	private lastTime: number = Date.now();
	private totalTime: number = 0;

	constructor(
		private readonly enabled: boolean,
		protected logFunc = defaultLogger.log,
	) {}

	public log(msg?: string, print?: boolean): number {
		const currTime = Date.now();
		const diffTime = currTime - this.lastTime;
		this.lastTime = currTime;
		const diffTimeInSeconds = diffTime / 1000;
		if (msg !== undefined) {
			if (this.enabled) {
				if (diffTime > 100) {
					this.logFunc(`${msg} - ${diffTimeInSeconds.toFixed(3)}s`);
				} else {
					this.logFunc(`${msg} - ${diffTime}ms`);
				}
			} else if (print === true) {
				this.logFunc(msg);
			}
		}
		this.totalTime += diffTime;
		return diffTimeInSeconds;
	}

	public getTotalTime(): number {
		return this.totalTime;
	}
}
