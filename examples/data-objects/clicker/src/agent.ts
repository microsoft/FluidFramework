/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCounter } from "@fluidframework/counter/legacy";

/**
 * Simple interface for a runnable agent.
 */
interface IRunnable {
	run(...args: any[]): Promise<void>;
	stop(reason?: string): void;
}

// Sample agent to run.
export class ClickerAgent implements IRunnable {
	constructor(private readonly counter: SharedCounter) {}

	private readonly logIncrement = (incrementValue: number, currentValue: number): void => {
		console.log(`Incremented by ${incrementValue}. New value ${currentValue}`);
	};

	public async run(): Promise<void> {
		this.counter.on("incremented", this.logIncrement);
	}

	public stop(): void {
		this.counter.off("incremented", this.logIncrement);
	}
}
