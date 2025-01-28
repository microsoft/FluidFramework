/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	IEvent,
	IFluidLoadable,
	IRequest,
	IResponse,
} from "@fluidframework/core-interfaces";
import type {
	IFluidHandleInternal,
	// eslint-disable-next-line import/no-deprecated
	IProvideFluidHandle,
} from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { IFluidDataStoreContext } from "@fluidframework/runtime-definitions/internal";
import { create404Response } from "@fluidframework/runtime-utils/internal";
import type { AsyncFluidObjectProvider } from "@fluidframework/synthesize/internal";

import type { DataObjectTypes, IDataObjectProps } from "./types.js";

/**
 * This is a bare-bones base class that does basic setup and enables for factory on an initialize call.
 * You probably don't want to inherit from this data store directly unless
 * you are creating another base data store class
 *
 * @typeParam I - The optional input types used to strongly type the data object
 * @legacy
 * @alpha
 */
export abstract class PureDataObject<I extends DataObjectTypes = DataObjectTypes>
	extends TypedEventEmitter<I["Events"] & IEvent>
	// eslint-disable-next-line import/no-deprecated
	implements IFluidLoadable, IProvideFluidHandle
{
	/**
	 * This is your FluidDataStoreRuntime object
	 */
	protected readonly runtime: IFluidDataStoreRuntime;

	/**
	 * This context is used to talk up to the IContainerRuntime
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

	/**
	 * Internal implementation detail.
	 * Subclasses should not use this.
	 * @privateRemarks
	 * For unknown reasons this API was exposed as a protected member with no documented behavior nor any external usage or clear use-case.
	 * Ideally a breaking change would be made to replace this with a better named private property like `#initializationPromise` when permitted.
	 */
	protected initializeP: Promise<void> | undefined;

	public get id(): string {
		return this.runtime.id;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IProvideFluidLoadable.IFluidLoadable}
	 */
	public get IFluidLoadable(): this {
		return this;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IProvideFluidHandle.IFluidHandle}
	 */
	public get IFluidHandle(): IFluidHandleInternal<this> {
		return this.handle;
	}

	/**
	 * Handle to a data store
	 */
	public get handle(): IFluidHandleInternal<this> {
		// PureDataObjectFactory already provides an entryPoint initialization function to the data store runtime,
		// so this object should always have access to a non-null entryPoint. Need to cast because PureDataObject
		// tried to be too smart with its typing for handles :).
		assert(this.runtime.entryPoint !== undefined, 0x46b /* EntryPoint was undefined */);
		return this.runtime.entryPoint as IFluidHandleInternal<this>;
	}

	public static async getDataObject(runtime: IFluidDataStoreRuntime): Promise<PureDataObject> {
		const obj = await runtime.entryPoint.get();
		return obj as PureDataObject;
	}

	public constructor(props: IDataObjectProps<I>) {
		super();
		this.runtime = props.runtime;
		this.context = props.context;
		this.providers = props.providers;
		this.initProps = props.initProps;
	}

	/**
	 * Return this object if someone requests it directly
	 * We will return this object in two scenarios:
	 *
	 * 1. the request url is a "/"
	 *
	 * 2. the request url is empty
	 */
	public async request(req: IRequest): Promise<IResponse> {
		return req.url === "" || req.url === "/" || req.url.startsWith("/?")
			? { mimeType: "fluid/object", status: 200, value: this }
			: create404Response(req);
	}

	/**
	 * Await this API to ensure PureDataObject is fully initialized.
	 * Initialization happens on demand, only on as-needed bases.
	 * In most cases you should allow factory/object to decide when to finish initialization.
	 * But if you are supplying your own implementation of DataStoreRuntime factory and overriding some methods
	 * and need a fully initialized object, then you can await this API to ensure object is fully initialized.
	 */
	public async finishInitialization(existing: boolean): Promise<void> {
		this.initializeP ??= this.initializeInternal(existing);
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
}
