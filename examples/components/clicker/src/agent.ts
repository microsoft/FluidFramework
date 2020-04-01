/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRouter, IComponentRunnable, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { Counter } from "@microsoft/fluid-map";

// Sample agent to run.
export class ClickerAgent implements IComponentRouter, IComponentRunnable {

    constructor(private readonly counter: Counter) { }

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

    public async run() {
        this.counter.on("incremented", (incrementValue: number, currentValue: number) => {
            console.log(`Incremented by ${incrementValue}. New value ${currentValue}`);
        });
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }
}
