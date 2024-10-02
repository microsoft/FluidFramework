/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "./assert";
import { Deferred } from "./promises";

/**
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 * @internal
 */
export interface ITimer {
	/**
	 * True if timer is currently running
	 */
	readonly hasTimer: boolean;

	/**
	 * Starts the timer
	 */
	start(): void;

	/**
	 * Cancels the timer if already running
	 */
	clear(): void;
}

/**
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 */
interface ITimeout {
	/**
	 * Tick that timeout was started.
	 */
	startTick: number;

	/**
	 * Timeout duration in ms.
	 */
	duration: number;

	/**
	 * Handler to execute when timeout ends.
	 */
	handler: () => void;
}

/**
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 */
interface IRunningTimerState extends ITimeout {
	/**
	 * JavaScript Timeout object.
	 */
	timeout: ReturnType<typeof setTimeout>;

	/**
	 * Intended duration in ms.
	 */
	intendedDuration: number;

	/**
	 * Intended restart timeout.
	 */
	restart?: ITimeout;
}

const maxSetTimeoutMs = 0x7fffffff; // setTimeout limit is MAX_INT32=(2^31-1).

/**
 * Sets timeouts like the setTimeout function allowing timeouts to exceed the setTimeout's max timeout limit.
 * Timeouts may not be exactly accurate due to browser implementations and the OS.
 * https://stackoverflow.com/questions/21097421/what-is-the-reason-javascript-settimeout-is-so-inaccurate
 * @param timeoutFn - Executed when the timeout expires
 * @param timeoutMs - Duration of the timeout in milliseconds
 * @param setTimeoutIdFn - Executed to update the timeout if multiple timeouts are required when
 * timeoutMs greater than maxTimeout
 * @returns The initial timeout
 *
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 * @internal
 */
export function setLongTimeout(
	timeoutFn: () => void,
	timeoutMs: number,
	setTimeoutIdFn?: (timeoutId: ReturnType<typeof setTimeout>) => void,
): ReturnType<typeof setTimeout> {
	// The setTimeout max is 24.8 days before looping occurs.
	let timeoutId: ReturnType<typeof setTimeout>;
	if (timeoutMs > maxSetTimeoutMs) {
		const newTimeoutMs = timeoutMs - maxSetTimeoutMs;
		timeoutId = setTimeout(
			() => setLongTimeout(timeoutFn, newTimeoutMs, setTimeoutIdFn),
			maxSetTimeoutMs,
		);
	} else {
		timeoutId = setTimeout(() => timeoutFn(), Math.max(timeoutMs, 0));
	}

	setTimeoutIdFn?.(timeoutId);
	return timeoutId;
}

/**
 * This class is a thin wrapper over setTimeout and clearTimeout which
 * makes it simpler to keep track of recurring timeouts with the same
 * or similar handlers and timeouts. This class supports long timeouts
 * or timeouts exceeding (2^31)-1 ms or approximately 24.8 days.
 *
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 * @internal
 */
export class Timer implements ITimer {
	/**
	 * Returns true if the timer is running.
	 */
	public get hasTimer(): boolean {
		return !!this.runningState;
	}

	private runningState: IRunningTimerState | undefined;

	constructor(
		private readonly defaultTimeout: number,
		private readonly defaultHandler: () => void,
		private readonly getCurrentTick: () => number = (): number => Date.now(),
	) {}

	/**
	 * Calls setTimeout and tracks the resulting timeout.
	 * @param ms - overrides default timeout in ms
	 * @param handler - overrides default handler
	 */
	public start(
		ms: number = this.defaultTimeout,
		handler: () => void = this.defaultHandler,
	): void {
		this.startCore(ms, handler, ms);
	}

	/**
	 * Calls clearTimeout on the underlying timeout if running.
	 */
	public clear(): void {
		if (!this.runningState) {
			return;
		}
		clearTimeout(this.runningState.timeout);
		this.runningState = undefined;
	}

	/**
	 * Restarts the timer with the new handler and duration.
	 * If a new handler is passed, the original handler may
	 * never execute.
	 * This is a potentially more efficient way to clear and start
	 * a new timer.
	 * @param ms - overrides previous or default timeout in ms
	 * @param handler - overrides previous or default handler
	 */
	public restart(ms?: number, handler?: () => void): void {
		if (this.runningState) {
			const duration = ms ?? this.runningState.intendedDuration;
			const handlerToUse =
				handler ?? this.runningState.restart?.handler ?? this.runningState.handler;
			const remainingTime = this.calculateRemainingTime(this.runningState);

			if (duration < remainingTime) {
				// If remaining time exceeds restart duration, do a hard restart.
				// The existing timeout time is too long.
				this.start(duration, handlerToUse);
			} else if (duration === remainingTime) {
				// The existing timeout time is perfect, just update handler and data.
				this.runningState.handler = handlerToUse;
				this.runningState.restart = undefined;
				this.runningState.intendedDuration = duration;
			} else {
				// If restart duration exceeds remaining time, set restart info.
				// Existing timeout will start a new timeout for remaining time.
				this.runningState.restart = {
					startTick: this.getCurrentTick(),
					duration,
					handler: handlerToUse,
				};
			}
		} else {
			// If restart is called first, it behaves as a call to start
			this.start(ms, handler);
		}
	}

	private startCore(duration: number, handler: () => void, intendedDuration: number): void {
		this.clear();
		this.runningState = {
			startTick: this.getCurrentTick(),
			duration,
			intendedDuration,
			handler,
			timeout: setLongTimeout(
				() => this.handler(),
				duration,
				(timer: number) => {
					if (this.runningState !== undefined) {
						this.runningState.timeout = timer;
					}
				},
			),
		};
	}

	private handler(): void {
		assert(!!this.runningState, 0x00a /* "Running timer missing handler" */);
		const restart = this.runningState.restart;
		if (restart === undefined) {
			// Run clear first, in case the handler decides to start again
			const handler = this.runningState.handler;
			this.clear();
			handler();
		} else {
			// Restart with remaining time
			const remainingTime = this.calculateRemainingTime(restart);
			this.startCore(remainingTime, () => restart.handler(), restart.duration);
		}
	}

	private calculateRemainingTime(runningTimeout: ITimeout): number {
		const elapsedTime = this.getCurrentTick() - runningTimeout.startTick;
		return runningTimeout.duration - elapsedTime;
	}
}

/**
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 * @internal
 */
export interface IPromiseTimerResult {
	timerResult: "timeout" | "cancel";
}

/**
 * Timer which offers a promise that fulfills when the timer
 * completes.
 *
 * @deprecated Moved to the `@fluid-private/client-utils` package.
 * @internal
 */
export interface IPromiseTimer extends ITimer {
	/**
	 * Starts the timer and returns a promise that
	 * resolves when the timer times out or is canceled.
	 */
	start(): Promise<IPromiseTimerResult>;
}

/**
 * This class is a wrapper over setTimeout and clearTimeout which
 * makes it simpler to keep track of recurring timeouts with the
 * same handlers and timeouts, while also providing a promise that
 * resolves when it times out.
 *
 * @deprecated Moved to the `@fluid-private/client-utils` package.
 * @internal
 */
export class PromiseTimer implements IPromiseTimer {
	private deferred?: Deferred<IPromiseTimerResult>;
	private readonly timer: Timer;

	/**
	 * {@inheritDoc Timer.hasTimer}
	 */
	public get hasTimer(): boolean {
		return this.timer.hasTimer;
	}

	constructor(defaultTimeout: number, defaultHandler: () => void) {
		this.timer = new Timer(defaultTimeout, () => this.wrapHandler(defaultHandler));
	}

	/**
	 * {@inheritDoc IPromiseTimer.start}
	 */
	public async start(ms?: number, handler?: () => void): Promise<IPromiseTimerResult> {
		this.clear();
		this.deferred = new Deferred<IPromiseTimerResult>();
		this.timer.start(ms, handler ? (): void => this.wrapHandler(handler) : undefined);
		return this.deferred.promise;
	}

	public clear(): void {
		this.timer.clear();
		if (this.deferred) {
			this.deferred.resolve({ timerResult: "cancel" });
			this.deferred = undefined;
		}
	}

	protected wrapHandler(handler: () => void): void {
		handler();
		assert(!!this.deferred, 0x00b /* "Handler executed without deferred" */);
		this.deferred.resolve({ timerResult: "timeout" });
		this.deferred = undefined;
	}
}
