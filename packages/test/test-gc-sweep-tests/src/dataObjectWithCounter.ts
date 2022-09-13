/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRandom } from "@fluid-internal/stochastic-test-utils";
import { assert } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { BaseTestDataObject } from "./testDataObjects";

const counterKey = "counter";
export class DataObjectWithCounter extends BaseTestDataObject {
    private _counterHandle?: IFluidHandle<SharedCounter>;
    public isRunning: boolean = false;
    public static get type(): string {
        return "OpSendingDataObject";
    }

    public get counterHandle(): IFluidHandle<SharedCounter> {
        assert(this._counterHandle !== undefined, `CounterHandle should always be defined!`);
        return this._counterHandle;
    }

    protected async initializingFirstTime(props?: any): Promise<void> {
        this.root.set<IFluidHandle>(counterKey, SharedCounter.create(this.runtime).handle);
    }

    protected async hasInitialized(): Promise<void> {
        // Use this to determine the local change count
        this._counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
    }

    public async sendOp(_count: number, _random: IRandom) {
        assert(this.counterHandle !== undefined, "Can't send ops when counter handle isn't set!");
        const counter = await this.counterHandle.get();
        counter.increment(1);
    }

    public stop() {
        this.isRunning = false;
    }
}
