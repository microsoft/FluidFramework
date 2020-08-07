/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidRouter, IFluidRunnable, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";

// Sample agent to run.
export class ClickerAgent implements IFluidRouter, IFluidRunnable {
    constructor(private readonly counter: SharedCounter) { }

    public get IFluidRouter() { return this; }
    public get IFluidRunnable() { return this; }

    public async run() {
        this.counter.on("incremented", (incrementValue: number, currentValue: number) => {
            console.log(`Incremented by ${incrementValue}. New value ${currentValue}`);
        });
    }

    public stop() {
        return;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }
}
