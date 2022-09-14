/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { DataObjectWithCounter, dataObjectWithCounterFactory } from "./dataObjectWithCounter";
import { allFactories } from "./testDataObjects";

const childKey = "childKey";
export class DataObjectWithChildDataObject extends DataObjectWithCounter {
    private unrefTimeStampMs?: number;
    private oldChild?: DataObjectWithCounter;
    private child?: DataObjectWithCounter;

    public static get type(): string {
        return "DataObjectWithChildDataObject";
    }

    protected async initializingFirstTime(props?: any): Promise<void> {
        await super.initializingFirstTime(props);
        await this.referenceNewChild();
    }

    protected async hasInitialized(): Promise<void> {
        await super.hasInitialized();
        const childHandle = this.root.get<IFluidHandle<DataObjectWithCounter>>(childKey);
        this.child = await childHandle?.get();
    }

    public stop() {
        this.child?.stop();
        this.isRunning = false;
    }

    public async unreferenceChild() {
        assert(this.child !== undefined, `Child should be defined when unreferencing!`);
        this.oldChild = this.child;
        this.child.stop();
        this.root.delete(childKey);
        this.unrefTimeStampMs = Date.now();
    }

    public async referenceNewChild() {
        this.child = await dataObjectWithCounterFactory.createInstance(this.context.containerRuntime);
        await this.referenceChild(this.child.handle);
    }

    public async referenceChild(handle: IFluidHandle<DataObjectWithCounter>) {
        this.oldChild = this.child;
        this.root.set(childKey, handle);
    }

    // This should only be called when inactiveObjectX time isn't greater than unrefTimeStampMs
    public async rereferenceChild() {
        assert(this.oldChild !== undefined, `An old handle should exist when re referencing`);
        assert(this.unrefTimeStampMs !== undefined, `An unreferenceTimestamp should exist when re referencing`);
        await this.referenceChild(this.oldChild.handle);
        this.oldChild = undefined;
        this.unrefTimeStampMs = undefined;
    }
}

export const dataObjectWithChildDataObjectFactory = new DataObjectFactory(
    DataObjectWithChildDataObject.type,
    DataObjectWithChildDataObject,
    allFactories,
    {},
);
