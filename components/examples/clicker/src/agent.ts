/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRouter, IComponentRunnable, IRequest, IResponse } from "@fluidframework/component-core-interfaces";
import { SharedCounter } from "@fluidframework/counter";

// Sample agent to run.
export class ClickerAgent implements IComponentRouter, IComponentRunnable {
    constructor(private readonly counter: SharedCounter) { }

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

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
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }
}
