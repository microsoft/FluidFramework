/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState, IDeltaManager, ILoaderOptions } from "@fluidframework/container-definitions";
import {
	IEventProvider,
	IRequest,
	IResponse,
	IFluidRouter,
	FluidObject,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
	IClientDetails,
	IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import {
	FlushMode,
	IContainerRuntimeBase,
	IContainerRuntimeBaseEvents,
	IDataStore,
	IFluidDataStoreContextDetached,
	IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions";

/**
 * @deprecated Not necessary if consumers add a new dataStore to the container by storing its handle.
 */
export interface IDataStoreWithBindToContext_Deprecated extends IDataStore {
	fluidDataStoreChannel?: { bindToContext?(): void };
}

export interface IContainerRuntimeEvents extends IContainerRuntimeBaseEvents {
	(event: "dirty" | "disconnected" | "dispose" | "saved" | "attached", listener: () => void);
	(event: "connected", listener: (clientId: string) => void);
}

export type IContainerRuntimeBaseWithCombinedEvents = IContainerRuntimeBase &
	IEventProvider<IContainerRuntimeEvents>;

/*
 * Represents the runtime of the container. Contains helper functions/state of the container.
 */
export interface IContainerRuntime
	extends IProvideFluidDataStoreRegistry,
		IContainerRuntimeBaseWithCombinedEvents {
	readonly options: ILoaderOptions;
	readonly clientId: string | undefined;
	readonly clientDetails: IClientDetails;
	readonly connected: boolean;
	readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
	readonly storage: IDocumentStorageService;
	readonly flushMode: FlushMode;
	readonly scope: FluidObject;
	/**
	 * Indicates the attachment state of the container to a host service.
	 */
	readonly attachState: AttachState;

	/**
	 * Returns the runtime of the data store.
	 * @param id - Id supplied during creating the data store.
	 * @param wait - True if you want to wait for it.
	 * @deprecated - Use getAliasedDataStoreEntryPoint instead to get an aliased data store's entry point.
	 */
	getRootDataStore(id: string, wait?: boolean): Promise<IFluidRouter>;

	/**
	 * Returns the aliased data store's entryPoint, given the alias.
	 * @param alias - The alias for the data store.
	 * @returns The data store's entry point ({@link @fluidframework/core-interfaces#IFluidHandle}) if it exists and is aliased.
	 * Returns undefined if no data store has been assigned the given alias.
	 */
	getAliasedDataStoreEntryPoint?(alias: string): Promise<IFluidHandle<FluidObject> | undefined>;

	/**
	 * Creates detached data store context. Data store initialization is considered complete
	 * only after context.attachRuntime() is called.
	 * @param pkg - package path
	 * @param rootDataStoreId - data store ID (unique name). Must not contain slashes.
	 */
	createDetachedRootDataStore(
		pkg: Readonly<string[]>,
		rootDataStoreId: string,
	): IFluidDataStoreContextDetached;

	/**
	 * Returns true if document is dirty, i.e. there are some pending local changes that
	 * either were not sent out to delta stream or were not yet acknowledged.
	 */
	readonly isDirty: boolean;

	/**
	 * Get an absolute url for a provided container-relative request.
	 * Returns undefined if the container isn't attached to storage.
	 * @param relativeUrl - A relative request within the container
	 */
	getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;

	/**
	 * Resolves handle URI
	 * @param request - request to resolve
	 */
	resolveHandle(request: IRequest): Promise<IResponse>;
}
