/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRandom } from "@fluid-internal/stochastic-test-utils";
import { DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, delay } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { BaseTestDataObject, allFactories } from "./testDataObjects";

const counterKey = "counter";
const delayPerOp = 100;
export abstract class BaseOpDataObject extends BaseTestDataObject {
    protected isRunning: boolean = false;
    public get counterHandle(): IFluidHandle<SharedCounter> {
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
        assert(counterHandle !== undefined, `CounterHandle should always be defined!`);
        return counterHandle;
    }
    protected count?: number;
    protected random?: IRandom;
    private opsPerformed: number = 0;

    protected async initializingFirstTime(props?: any): Promise<void> {
        this.root.set<IFluidHandle>(counterKey, SharedCounter.create(this.runtime).handle);
    }

    protected async hasInitialized(): Promise<void> {
        // Use this to determine the local change count
        this.opsPerformed = 0;
    }

    public abstract sendOp(count: number, random: IRandom): Promise<void>;

    public abstract stop(): void;

    public start(count: number, random: IRandom) {
        this.isRunning = true;
        this.sendOps(count, random).catch((error) => { console.log(error); });
    }

    /**
     * @param count - number of ops performed
     * @param random - used to control randomization consistently across all clients
     *
     * Perform 1000 ops and then do something interesting to GC as in reference and unreference datastores
     */
    private async sendOps(count: number, random: IRandom) {
        assert(this.counterHandle !== undefined, "Can't send ops when counter handle isn't set!");
        assert(this.isRunning === true, "Should be running to send ops");
        const counter = await this.counterHandle.get();
        while (this.opsPerformed < count && this.isRunning && !this.disposed) {
            // This count is shared across dataObjects so this should reach clients * datastores * count
            counter.increment(1);
            // This data is local and allows us to understand the number of changes a local client has created
            this.opsPerformed++;
            await delay(delayPerOp);
        }
        if (this.isRunning && !this.disposed) {
            await this.sendOp(count, random);
        }
        this.stop();
    }
}

export class OpSendingDataObject extends BaseOpDataObject {
    public static get type(): string {
        return "OpSendingDataObject";
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

const childKey = "childKey";
export class ReferencingDataObject extends BaseOpDataObject {
    private unrefTimeStampMs?: number;
    private oldChildHandle?: IFluidHandle<OpSendingDataObject>;
    private child?: OpSendingDataObject;

    public static get type(): string {
        return "ReferencingDataObject";
    }

    private get childHandle(): IFluidHandle<OpSendingDataObject> | undefined {
        return this.root.get<IFluidHandle<OpSendingDataObject>>(childKey);
    }

    protected async initializingFirstTime(props?: any): Promise<void> {
        const child = await opSendingDataObjectFactory.createInstance(this.containerRuntime);
        this.root.set<IFluidHandle>(childKey, child.handle);
    }

    protected async hasInitialized(): Promise<void> {
        await super.hasInitialized();
        this.root.on("valueChanged", (change) => {
            if (change.key === childKey) {
                this.child?.stop();
                this.child = this.root.get(change.key);
            }
        });
    }

    // do activity
    public async sendOp(count: number, random: IRandom) {
        assert(this.counterHandle !== undefined, "Can't send ops when counter handle isn't set!");
        const availableOps: (() => Promise<void>)[] =
        [
            async () => { await this.referenceNew(count, random); },
            async () => { /** no op */ },
        ];
        if (this.childHandle !== undefined) {
           availableOps.push(async () => { await this.unreference(); });
        }
        if (this.oldChildHandle !== undefined) {
            availableOps.push(async () => { await this.rereference(count, random); });
        }
        const op = random.pick(availableOps);
        await op();
    }

    public stop() {
        this.child?.stop();
        this.isRunning = false;
    }

    public async createDataObject() {
        const dataStore = await this.containerRuntime.createDataStore(OpSendingDataObject.type);
        const dataObject = await requestFluidObject<OpSendingDataObject>(dataStore, "/");
        return dataObject;
    }

    public async unreference() {
        assert(this.childHandle !== undefined, `Child handle should be defined when unreferencing!`);
        this.oldChildHandle = this.childHandle;
        const child = await this.oldChildHandle.get();
        child.stop();
        this.root.delete(childKey);
    }

    public async referenceNew(count: number, random: IRandom) {
        const child = await this.createDataObject();
        await this.referenceAndStart(count, random, child.handle);
    }

    public async referenceAndStart(count: number, random: IRandom, handle: IFluidHandle<OpSendingDataObject>) {
        this.oldChildHandle = this.childHandle;
        this.root.set(childKey, handle);
        this.unrefTimeStampMs = Date.now();
        this.child = await handle.get();
        this.child.start(count, random);
    }

    public async rereference(count: number, random: IRandom) {
        assert(this.oldChildHandle !== undefined, `An old handle should exist when referencing`);
        assert(this.unrefTimeStampMs !== undefined, `An unreferenceTimestamp`);
        await this.referenceAndStart(count, random, this.oldChildHandle);
        this.oldChildHandle = undefined;
        this.unrefTimeStampMs = undefined;
    }
}

export const referencingDataObjectFactory = new DataObjectFactory(
    ReferencingDataObject.type,
    ReferencingDataObject,
    allFactories,
    {},
);

export const opSendingDataObjectFactory = new DataObjectFactory(
    OpSendingDataObject.type,
    OpSendingDataObject,
    allFactories,
    {},
);
