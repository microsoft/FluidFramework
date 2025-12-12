/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-internal-modules -- #26908: `core-interfaces` internal used in examples
import { IFluidRunnable } from "@fluidframework/core-interfaces/internal";
import { SharedCounter } from "@fluidframework/counter/legacy";

// Sample agent to run.
export class ClickerAgent implements IFluidRunnable {
	constructor(private readonly counter: SharedCounter) {}

	public get IFluidRunnable(): IFluidRunnable {
		return this;
	}

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
