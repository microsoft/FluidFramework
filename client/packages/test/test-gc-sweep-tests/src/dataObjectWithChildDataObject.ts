/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, delay } from "@fluidframework/common-utils";
import { SharedCounter } from "@fluidframework/counter";
import { DataObjectWithCounter, dataObjectWithCounterFactory } from "./dataObjectWithCounter";

/**
 * A root dataObject that repeatedly sends a series of ops, and then references a new child or
 * unreferences a child. That child is unique to a particular client and a particular dataObject.
 * For example, if there are two clients A and B, there will be one rootDataObject and 2 child
 * data objects that can be potentially referenced at one point.
 */
export class RootDataObjectWithChildDataObject extends DataObjectWithCounter {
    private child?: DataObjectWithCounter;
    private readonly opsToWait = 1000;
    private localOpsPerformed: number = 0;
    private uniqueId?: string;
    private get childKey(): string {
        assert(this.uniqueId !== undefined, `A uniqueId needs to be defined to retrieve the child key!`);
        return `childKey:${this.uniqueId}`;
    }

    public static get type(): string {
        return "RootDataObjectWithChildDataObject";
    }

    protected async hasInitialized(): Promise<void> {
        await super.hasInitialized();
        this.uniqueId = makeRandom().uuid4();
        await this.createAndReferenceChild();
        this.start();
    }

    private unreferenceChild() {
        assert(this.child !== undefined, `Child should be defined when unreferencing!`);
        this.child.stop();
        this.root.delete(this.childKey);
    }

    private async createAndReferenceChild() {
        // If this assert is hit, we may potentially have a child that is running and we did not stop it.
        assert(this.child === undefined, "A child should not exist!");
        this.child = await dataObjectWithCounterFactory.createInstance(this.context.containerRuntime);
        this.root.set(this.childKey, this.child.handle);
        this.child.start();
    }

    protected async run() {
        assert(this.isRunning === true, "Should be running to send ops");

        // The ideal loop is to send a number of counter ops, and then reference or unreference a child.
        while (this.isRunning && !this.disposed) {
            // Every this.opsToWait, we want to either reference or unreference a datastore.
            if (this.localOpsPerformed % this.opsToWait === 0) {
                // Reference the child if there is none, unreference if there is one.
                // Referencing and unreferencing should automatically stop and start the child.
                // TODO: potentially reference an old child
                if (this.child === undefined) {
                    await this.createAndReferenceChild();
                } else {
                    this.unreferenceChild();
                }
            }

            // Count total ops performed on the datastore.
            this.counter.increment(1);
            // This data is local and allows us to understand the number of changes a local client has created.
            this.localOpsPerformed++;

            // This delay is const for now, potentially we would want to vary this value.
            await delay(this.delayPerOpMs);
        }
    }
}

export const rootDataObjectWithChildDataObjectFactory = new DataObjectFactory(
    RootDataObjectWithChildDataObject.type,
    RootDataObjectWithChildDataObject,
    [SharedCounter.getFactory()],
    {},
);
