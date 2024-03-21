/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SignalListener } from "@fluid-experimental/data-objects";
import { EventEmitter } from "@fluid-internal/client-utils";
import { DataObject, DataObjectFactory, IDataObjectProps } from "@fluidframework/aqueduct";
import { IFluidHandle, type IErrorEvent } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";

export class TestDataObject extends DataObject {
	public static readonly Name = "@fluid-example/test-data-object";

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

export class CounterTestDataObject extends DataObject {
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
		CounterTestDataObject.Name,
		CounterTestDataObject,
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

/**
 * Test implementation of experimental Signaler for testing scenarios working with signals.
 */
export class SignalerTestDataObject extends DataObject<{ Events: IErrorEvent }> {
	private readonly emitter = new EventEmitter();
	public static readonly Name = "@fluid-example/signaler-test-data-object";

	public static readonly factory = new DataObjectFactory(
		SignalerTestDataObject.Name,
		SignalerTestDataObject,
		[],
		{},
	);

	protected async hasInitialized() {
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

	public offSignal<T>(signalName: string, listener: SignalListener<T>): SignalerTestDataObject {
		this.emitter.off(signalName, listener);
		return this;
	}

	public submitSignal<T>(signalName: string, payload?: Jsonable<T>) {
		this.runtime.submitSignal(signalName, payload);
	}
}
