/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SignalListener } from "@fluid-experimental/data-objects";
import { EventEmitter } from "@fluid-internal/client-utils";
import {
	DataObject,
	DataObjectFactory,
	IDataObjectProps,
} from "@fluidframework/aqueduct/internal";
import { type IErrorEvent, IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import { Jsonable } from "@fluidframework/datastore-definitions/internal";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";
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

class CounterTestDataObjectClass extends DataObject {
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

/**
 * Test implementation of experimental Signaler for testing scenarios working with signals.
 */
export class SignalerTestDataObjectClass extends DataObject<{ Events: IErrorEvent }> {
	private readonly emitter = new EventEmitter();
	public static readonly Name = "@fluid-example/signaler-test-data-object";

	public static readonly factory = new DataObjectFactory(
		SignalerTestDataObjectClass.Name,
		SignalerTestDataObjectClass,
		[],
		{},
	);

	protected async hasInitialized(): Promise<void> {
		this.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
			const clientId = message.clientId;
			/**
			 * {@link Signaler} checks `runtime.connected` before allowing a signal to be sent/received.
			 * However, that is never `true` for "read" clients, so we don't want to check it here.
			 */
			if (clientId !== null) {
				this.emitter.emit(message.type, clientId, local, message.content);
			}
		});
	}

	// ISignaler methods  Note these are all passthroughs

	public onSignal<T>(signalName: string, listener: SignalListener<T>): SignalerTestDataObject {
		this.emitter.on(signalName, listener);
		return this;
	}

	public offSignal<T>(
		signalName: string,
		listener: SignalListener<T>,
	): SignalerTestDataObject {
		this.emitter.off(signalName, listener);
		return this;
	}

	public submitSignal<T>(signalName: string, payload?: Jsonable<T>): void {
		this.runtime.submitSignal(signalName, payload);
	}
}

export const SignalerTestDataObject = createDataObjectKind(SignalerTestDataObjectClass);
export type SignalerTestDataObject = SignalerTestDataObjectClass;
