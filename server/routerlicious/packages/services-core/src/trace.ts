/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "@fluidframework/common-utils";

/**
 * @internal
 */
export interface IStageTrace {
	/**
	 * Name of the Stage.
	 */
	stage: string;
	/**
	 * Start time of the stage relative to the previous stage's start time.
	 */
	ts: number;
}

/**
 * Utility class to trace different stages of an operation with timestamps relative to each other.
 * @internal
 */
export class StageTrace<T extends { toString(): string }> {
	private readonly traces: IStageTrace[] = [];
	#lastStampedTraceTime: number = performance.now();

	constructor(initialStage?: T) {
		if (initialStage) {
			this.traces.push({ stage: initialStage.toString(), ts: 0 });
		}
	}
	/**
	 * Get the collected trace information.
	 */
	public get trace(): IStageTrace[] {
		return this.traces;
	}
	/**
	 * Stamp a new stage with the time elapsed since the last stage stamp.
	 * @remarks
	 * If this is the first stage being stamped after construction, the time elapsed
	 * will be since construction.
	 *
	 * @param stage - stage to be stringified for trace stage name.
	 */
	public stampStage(stage: T): void {
		const now = performance.now();
		this.traces.push({ stage: stage.toString(), ts: now - this.#lastStampedTraceTime });
		this.#lastStampedTraceTime = now;
	}
}
