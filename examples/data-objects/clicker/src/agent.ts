/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules -- #26908: `core-interfaces` internal used in examples
import { IFluidRunnable } from "@fluidframework/core-interfaces/internal";
import { SharedCounter } from "@fluidframework/counter/legacy";

// Sample agent to run.
export class ClickerAgent implements IFluidRunnable {
	constructor(private readonly counter: SharedCounter) {}

	public get IFluidRunnable() {
		return this;
	}

	private readonly logIncrement = (incrementValue: number, currentValue: number) => {
		console.log(`Incremented by ${incrementValue}. New value ${currentValue}`);
	};

	public async run() {
		this.counter.on("incremented", this.logIncrement);
	}

	public stop() {
		this.counter.off("incremented", this.logIncrement);
	}
}
