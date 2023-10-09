/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidRunnable, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";

// Sample agent to run.
export class ClickerAgent implements IFluidRunnable {
	constructor(private readonly counter: SharedCounter) {}

	public get IFluidRouter() {
		return this;
	}
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

	public async request(request: IRequest): Promise<IResponse> {
		return {
			mimeType: "fluid/object",
			status: 200,
			value: this,
		};
	}
}
