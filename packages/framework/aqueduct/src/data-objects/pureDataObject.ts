/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "events";
import { assert, EventForwarder } from "@fluidframework/common-utils";
import {
	IEvent,
	IEventProvider,
	IFluidHandle,
	IFluidLoadable,
	IFluidRouter,
	IProvideFluidHandle,
	IRequest,
	IResponse,
} from "@fluidframework/core-interfaces";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { AsyncFluidObjectProvider } from "@fluidframework/synthesize";
import { defaultFluidObjectRequestHandler } from "../request-handlers";
import { DataObjectTypes, IDataObjectProps } from "./types";

/**
 * This is a bare-bones base class that does basic setup and enables for factory on an initialize call.
 * You probably don't want to inherit from this data store directly unless
 * you are creating another base data store class
 *
 * @typeParam I - The optional input types used to strongly type the data object
 */
export abstract class PureDataObject<I extends DataObjectTypes = DataObjectTypes>
	extends EventForwarder<I["Events"] & IEvent>
	implements IFluidLoadable, IFluidRouter, IProvideFluidHandle
{
	private _disposed = false;

	/**
	 * This is your FluidDataStoreRuntime object
	 */
	protected readonly runtime: IFluidDataStoreRuntime;

	/**
	 * This context is used to talk up to the ContainerRuntime
	 */
	protected readonly context: IFluidDataStoreContext;

	/**
	 * Providers are FluidObject keyed objects that provide back
	 * a promise to the corresponding FluidObject or undefined.
	 * Providers injected/provided by the Container and/or HostingApplication
	 *
	 * To define providers set FluidObject interfaces in the OptionalProviders generic type for your data store
	 */
	protected readonly providers: AsyncFluidObjectProvider<I["OptionalProviders"]>;

	protected initProps?: I["InitialState"];

	protected initializeP: Promise<void> | undefined;

	/**
	 * @deprecated 2.0.0-internal.5.2.0 - PureDataObject does not provide a functioning built-in disposed flow.
	 * This member will be removed in an upcoming release.
	 */
	public get disposed() {
		return this._disposed;
	}

	public get id() {
		return this.runtime.id;
	}
	public get IFluidRouter() {
		return this;
	}
	public get IFluidLoadable() {
		return this;
	}
	public get IFluidHandle() {
		return this.handle;
	}

	/**
	 * Handle to a data store
	 */
	public get handle(): IFluidHandle<this> {
		// PureDataObjectFactory already provides an entryPoint initialization function to the data store runtime,
		// so this object should always have access to a non-null entryPoint. Need to cast because PureDataObject
		// tried to be too smart with its typing for handles :).
		assert(this.runtime.entryPoint !== undefined, 0x46b /* EntryPoint was undefined */);
		return this.runtime.entryPoint as IFluidHandle<this>;
	}

	public static async getDataObject(runtime: IFluidDataStoreRuntime) {
		const obj = await runtime.entryPoint?.get();
		assert(obj !== undefined, 0x0bc /* "The runtime's handle is not initialized yet!" */);
		return obj as PureDataObject;
	}

	public constructor(props: IDataObjectProps<I>) {
		super();
		this.runtime = props.runtime;
		this.context = props.context;
		this.providers = props.providers;
		this.initProps = props.initProps;

		assert(
			(this.runtime as any)._dataObject === undefined,
			0x0bd /* "Object runtime already has DataObject!" */,
		);
		(this.runtime as any)._dataObject = this;

		// Container event handlers
		this.runtime.once("dispose", () => {
			this._disposed = true;
			this.dispose();
		});
	}

	// #region IFluidRouter

	/**
	 * Return this object if someone requests it directly
	 * We will return this object in two scenarios:
	 *
	 * 1. the request url is a "/"
	 *
	 * 2. the request url is empty
	 */
	public async request(req: IRequest): Promise<IResponse> {
		return defaultFluidObjectRequestHandler(this, req);
	}

	// #endregion IFluidRouter

	/**
	 * Call this API to ensure PureDataObject is fully initialized.
	 * Initialization happens on demand, only on as-needed bases.
	 * In most cases you should allow factory/object to decide when to finish initialization.
	 * But if you are supplying your own implementation of DataStoreRuntime factory and overriding some methods
	 * and need a fully initialized object, then you can call this API to ensure object is fully initialized.
	 */
	public async finishInitialization(existing: boolean): Promise<void> {
		if (this.initializeP !== undefined) {
			return this.initializeP;
		}
		this.initializeP = this.initializeInternal(existing);
		return this.initializeP;
	}

	/**
	 * Internal initialize implementation. Overwriting this will change the flow of the PureDataObject and should
	 * generally not be done.
	 *
	 * Calls initializingFirstTime, initializingFromExisting, and hasInitialized. Caller is
	 * responsible for ensuring this is only invoked once.
	 */
	public async initializeInternal(existing: boolean): Promise<void> {
		await this.preInitialize();
		if (existing) {
			assert(
				this.initProps === undefined,
				0x0be /* "Trying to initialize from existing while initProps is set!" */,
			);
			await this.initializingFromExisting();
		} else {
			await this.initializingFirstTime(
				(this.context.createProps as I["InitialState"]) ?? this.initProps,
			);
		}
		await this.hasInitialized();
	}

	/**
	 * Called every time the data store is initialized, before initializingFirstTime or
	 * initializingFromExisting is called.
	 */
	protected async preInitialize(): Promise<void> {}

	/**
	 * Called the first time the data store is initialized (new creations with a new
	 * data store runtime)
	 *
	 * @param props - Optional props to be passed in on create
	 */
	protected async initializingFirstTime(props?: I["InitialState"]): Promise<void> {}

	/**
	 * Called every time but the first time the data store is initialized (creations
	 * with an existing data store runtime)
	 */
	protected async initializingFromExisting(): Promise<void> {}

	/**
	 * Called every time the data store is initialized after create or existing.
	 */
	protected async hasInitialized(): Promise<void> {}

	/**
	 * Called when the host container closes and disposes itself
	 * @deprecated 2.0.0-internal.5.2.0 - Dispose does nothing and will be removed in an upcoming release.
	 */
	public dispose(): void {
		super.dispose();
	}

	/**
	 * @deprecated 2.0.0-internal.5.2.0 - PureDataObject does not actually set up to forward events, and will not be an EventForwarder
	 * in a future release.
	 */
	protected static isEmitterEvent(event: string): boolean {
		return super.isEmitterEvent(event);
	}

	/**
	 * @deprecated 2.0.0-internal.5.2.0 - PureDataObject does not actually set up to forward events, and will not be an EventForwarder
	 * in a future release.
	 */
	protected forwardEvent(
		source: EventEmitter | IEventProvider<I["Events"] & IEvent>,
		...events: string[]
	): void {
		super.forwardEvent(source, ...events);
	}

	/**
	 * @deprecated 2.0.0-internal.5.2.0 - PureDataObject does not actually set up to forward events, and will not be an EventForwarder
	 * in a future release.
	 */
	protected unforwardEvent(
		source: EventEmitter | IEventProvider<I["Events"] & IEvent>,
		...events: string[]
	): void {
		super.unforwardEvent(source, ...events);
	}
}
