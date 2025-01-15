/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DataObject,
	DataObjectFactory,
	IDataObjectProps,
} from "@fluidframework/aqueduct/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import { createDataObjectKind } from "@fluidframework/shared-object-base/internal";

class TestDataObjectClass extends DataObject {
	public static readonly Name = "@fluid-example/test-data-object";

	public static readonly factory = new DataObjectFactory(
		TestDataObjectClass.Name,
		TestDataObjectClass,
		[],
		{},
	);

	constructor(props: IDataObjectProps) {
		super(props);
	}
}

export const TestDataObject = createDataObjectKind(TestDataObjectClass);
export type TestDataObject = TestDataObjectClass;

export class CounterTestDataObjectClass extends DataObject {
	private _counter: SharedCounter | undefined;

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

	public static readonly Name = "@fluid-example/counter-test-data-object";

	public static readonly factory = new DataObjectFactory(
		CounterTestDataObjectClass.Name,
		CounterTestDataObjectClass,
		[SharedCounter.getFactory()],
		{},
	);

	public increment(): void {
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

export const CounterTestDataObject = createDataObjectKind(CounterTestDataObjectClass);
export type CounterTestDataObject = CounterTestDataObjectClass;
