/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory, IDataObjectProps } from "@fluidframework/aqueduct";
import { SharedCounter } from "@fluidframework/counter";
import { IFluidHandle } from "@fluidframework/core-interfaces";

export class TestDataObject extends DataObject {
    public static get Name(): string {
        return "@fluid-example/test-data-object";
    }

    public static readonly factory = new DataObjectFactory(
        TestDataObject.Name,
        TestDataObject,
        [],
        {},
    );

    constructor(props: IDataObjectProps) {
        super(props);
    }
}

export class TestDataObject2 extends DataObject {
    private _counter: SharedCounter | undefined;

    constructor(props: IDataObjectProps) {
        super(props);
    }

    /**
     * Do setup work here
     */
    protected async initializingFirstTime(): Promise<void> {
        const counter = SharedCounter.create(this.runtime);
        this.root.set("counter-key", counter.handle);
    }

    protected async hasInitialized(): Promise<void> {
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>("counter-key");
        this._counter = await counterHandle?.get();
    }

    public static get Name(): string {
        return "@fluid-example/test-data-object-2";
    }

    public static readonly factory = new DataObjectFactory(
        TestDataObject2.Name,
        TestDataObject2,
        [SharedCounter.getFactory()],
        {},
    );

    public increment(): void {
        this.counter.increment(1);
    }

    public reset(): void {
        this.counter.increment(1);
    }

    public get value(): number {
        return this.counter.value;
    }

    private get counter(): SharedCounter {
        if (this._counter === undefined) {
            throw new Error("SharedCounter not initialized");
        }
        return this._counter;
    }
}

export class BadTestDataObject extends DataObject {
    public static get Name(): string {
        return "@fluid-example/bad-test-data-object";
    }

    constructor(props: IDataObjectProps) {
        super(props);
    }
}
