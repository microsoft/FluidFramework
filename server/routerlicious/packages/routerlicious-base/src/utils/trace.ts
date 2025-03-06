/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

interface IStageTrace {
	/**
	 * Name of the Stage.
	 */
	stage: string;
	/**
	 * Start time of the stage relative to the previous stage's start time.
	 */
	ts: number;
}
export class StageTrace<T extends { toString(): string }> {
	private readonly traces: IStageTrace[] = [];
	private lastStampedTraceTime: number = performance.now();
	constructor(initialStage?: T) {
		if (initialStage) {
			this.traces.push({ stage: initialStage.toString(), ts: 0 });
		}
	}
	public get trace(): IStageTrace[] {
		return this.traces;
	}
	public stampStage(stage: T): void {
		const now = performance.now();
		this.traces.push({ stage: stage.toString(), ts: now - this.lastStampedTraceTime });
		this.lastStampedTraceTime = now;
	}
}
