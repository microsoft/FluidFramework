/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { DataObjectWithCounter, dataObjectWithCounterFactory } from "./dataObjectWithCounter";

export class RootDataObjectWithChildDataObject extends DataObjectWithCounter {
    private unrefTimeStampMs?: number;
    private unreferencedChild?: DataObjectWithCounter;
    private child?: DataObjectWithCounter;
    private get childKey(): string {
        assert(this.context.clientId !== undefined, `client id needs to be defined to retrieve the child key!`);
        return `childKey:${this.context.clientId}`;
    }

    public static get type(): string {
        return "RootDataObjectWithChildDataObject";
    }

    protected async hasInitialized(): Promise<void> {
        await super.hasInitialized();
        await this.createAndReferenceChild();
        // TODO: Start logic goes here after we agree on what it should be.
    }

    public async unreferenceChild() {
        assert(this.child !== undefined, `Child should be defined when unreferencing!`);
        this.unreferencedChild = this.child;
        this.child.stop();
        this.root.delete(this.childKey);
        this.unrefTimeStampMs = Date.now();
    }

    public async createAndReferenceChild() {
        this.child = await dataObjectWithCounterFactory.createInstance(this.context.containerRuntime);
        await this.referenceChild(this.child.handle);
    }

    public async referenceChild(handle: IFluidHandle<DataObjectWithCounter>) {
        this.unreferencedChild = this.child;
        this.root.set(this.childKey, handle);
    }

    // This should only be called when inactiveObjectX time isn't greater than unrefTimeStampMs
    public async reviveChild() {
        assert(this.unreferencedChild !== undefined, `An old handle should exist when reviving`);
        assert(this.unrefTimeStampMs !== undefined, `An unreferenceTimestamp should exist when reviving`);
        await this.referenceChild(this.unreferencedChild.handle);
        this.unreferencedChild = undefined;
        this.unrefTimeStampMs = undefined;
    }

    public async doActivity() {
        // This is a placeholder method, there is value in leaving this for a later discussion.
    }
}

export const rootDataObjectWithChildDataObjectFactory = new DataObjectFactory(
    RootDataObjectWithChildDataObject.type,
    RootDataObjectWithChildDataObject,
    [SharedCounter.getFactory()],
    {},
);
