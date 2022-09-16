/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, delay } from "@fluidframework/common-utils";
import { SharedCounter } from "@fluidframework/counter";
import { DataObjectWithCounter, dataObjectWithCounterFactory } from "./dataObjectWithCounter";

export class RootDataObjectWithChildDataObject extends DataObjectWithCounter {
    private child?: DataObjectWithCounter;
    private readonly opsToWait = 1000;
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
        this.start();
    }

    private unreferenceChild() {
        assert(this.child !== undefined, `Child should be defined when unreferencing!`);
        this.child.stop();
        this.root.delete(this.childKey);
    }

    private async createAndReferenceChild() {
        this.child = await dataObjectWithCounterFactory.createInstance(this.context.containerRuntime);
        this.root.set(this.childKey, this.child.handle);
        this.child.start();
    }

    protected async sendOps() {
        assert(this.isRunning === true, "Should be running to send ops");
        while (this.isRunning && !this.disposed) {
            let opsPerformed = 0;
            while (opsPerformed < this.opsToWait && this.isRunning && !this.disposed) {
                super.sendOp();
                // This data is local and allows us to understand the number of changes a local client has created
                opsPerformed++;
                await delay(this.delayPerOpMs);
            }

            // Reference the child if there is none, unreference if there is one
            if (this.child === undefined) {
                await this.createAndReferenceChild();
            } else {
                this.unreferenceChild();
            }
        }
    }
}

export const rootDataObjectWithChildDataObjectFactory = new DataObjectFactory(
    RootDataObjectWithChildDataObject.type,
    RootDataObjectWithChildDataObject,
    [SharedCounter.getFactory()],
    {},
);
