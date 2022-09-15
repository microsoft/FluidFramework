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
    // TODO: logic to always keep a child referenced. A getter should retrieve this value and add some asserts
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

    // TODO: Make private - left public so the build passes
    public async unreferenceChild() {
        assert(this.child !== undefined, `Child should be defined when unreferencing!`);
        this.unreferencedChild = this.child;
        this.child.stop();
        this.root.delete(this.childKey);
        this.unrefTimeStampMs = Date.now();
    }

    private async createAndReferenceChild() {
        this.child = await dataObjectWithCounterFactory.createInstance(this.context.containerRuntime);
        await this.referenceChild(this.child.handle);
    }

    private async referenceChild(handle: IFluidHandle<DataObjectWithCounter>) {
        this.unreferencedChild = this.child;
        this.root.set(this.childKey, handle);
    }

    // This should only be called when inactiveObjectX time isn't greater than unrefTimeStampMs
    // TODO: Make private - left public so the build passes
    public async reviveChild() {
        assert(this.unreferencedChild !== undefined, `An old handle should exist when reviving`);
        assert(this.unrefTimeStampMs !== undefined, `An unreferenceTimestamp should exist when reviving`);
        await this.referenceChild(this.unreferencedChild.handle);
        this.unreferencedChild = undefined;
        this.unrefTimeStampMs = undefined;
    }

    // TODO: create a doActivity method that does interesting GC tasks
}

export const rootDataObjectWithChildDataObjectFactory = new DataObjectFactory(
    RootDataObjectWithChildDataObject.type,
    RootDataObjectWithChildDataObject,
    [SharedCounter.getFactory()],
    {},
);
