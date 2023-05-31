/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse, IFluidRouter, FluidObject } from "@fluidframework/core-interfaces";
import {
	IClientDetails,
	IDocumentMessage,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISequencedProposal,
	ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IAudience } from "./audience";
import { IDeltaManager, ReadOnlyInfo } from "./deltas";
import { ICriticalContainerError, ContainerWarning } from "./error";
import { IFluidModule } from "./fluidModule";
import { AttachState } from "./runtime";
import { IFluidCodeDetails, IFluidPackage, IProvideFluidCodeDetailsComparer } from "./fluidPackage";

/**
 * Encapsulates a module entry point with corresponding code details.
 */
export interface IFluidModuleWithDetails {
	/**
	 * Fluid code module that implements the runtime factory needed to instantiate the container runtime.
	 */
	module: IFluidModule;

	/**
	 * Code details associated with the module. Represents a document schema this module supports.
	 * If the code loader implements the {@link @fluidframework/core-interfaces#(IFluidCodeDetailsComparer:interface)}
	 * interface, it'll be called to determine whether the module code details satisfy the new code proposal in the
	 * quorum.
	 */
	details: IFluidCodeDetails;
}

/**
 * Fluid code loader resolves a code module matching the document schema, i.e. code details, such as
 * a package name and package version range.
 */
export interface ICodeDetailsLoader extends Partial<IProvideFluidCodeDetailsComparer> {
	/**
	 * Load the code module (package) that can interact with the document.
	 *
	 * @param source - Code proposal that articulates the current schema the document is written in.
	 * @returns - Code module entry point along with the code details associated with it.
	 */
	load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails>;
}

/**
 * The interface returned from a IFluidCodeResolver which represents IFluidCodeDetails
 * that have been resolved and are ready to load
 */
export interface IResolvedFluidCodeDetails extends IFluidCodeDetails {
	/**
	 * A resolved version of the Fluid package. All Fluid browser file entries should be absolute urls.
	 */
	readonly resolvedPackage: Readonly<IFluidPackage>;
	/**
	 * If not undefined, this id will be used to cache the entry point for the code package
	 */
	readonly resolvedPackageCacheId: string | undefined;
}

/**
 * Fluid code resolvers take a Fluid code details, and resolve the
 * full Fluid package including absolute urls for the browser file entries.
 * The Fluid code resolver is coupled to a specific cdn and knows how to resolve
 * the code detail for loading from that cdn. This include resolving to the most recent
 * version of package that supports the provided code details.
 */
export interface IFluidCodeResolver {
	/**
	 * Resolves a Fluid code details into a form that can be loaded.
	 * @param details - The Fluid code details to resolve.
	 * @returns - A IResolvedFluidCodeDetails where the resolvedPackage's Fluid file entries are absolute urls, and
	 * an optional resolvedPackageCacheId if the loaded package should be cached.
	 */
	resolveCodeDetails(details: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails>;
}

/**
 * Code AllowListing Interface
 *
 * @deprecated 2.0.0-internal.3.2.0 Fluid does not prescribe a particular code validation approach. Will be removed in an upcoming release.
 */
export interface ICodeAllowList {
	/**
	 * @deprecated 2.0.0-internal.3.2.0 Fluid does not prescribe a particular code validation approach. Will be removed in an upcoming release.
	 */
	testSource(source: IResolvedFluidCodeDetails): Promise<boolean>;
}

/**
 * Events emitted by the {@link IContainer} "upwards" to the Loader and Host.
 */
export interface IContainerEvents extends IEvent {
	/**
	 * Emitted when the readonly state of the container changes.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `readonly`: Whether or not the container is now in a readonly state.
	 *
	 * @see {@link IContainer.readOnlyInfo}
	 */
	(event: "readonly", listener: (readonly: boolean) => void): void;

	/**
	 * Emitted when the {@link IContainer} completes connecting to the Fluid service.
	 *
	 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
	 *
	 * @see
	 *
	 * - {@link IContainer.connectionState}
	 *
	 * - {@link IContainer.connect}
	 */
	(event: "connected", listener: (clientId: string) => void);

	/**
	 * Fires when new container code details have been proposed, prior to acceptance.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `codeDetails`: The code details being proposed.
	 *
	 * - `proposal`: NOT RECOMMENDED FOR USE.
	 *
	 * @see {@link IContainer.proposeCodeDetails}
	 */
	(
		event: "codeDetailsProposed",
		listener: (codeDetails: IFluidCodeDetails, proposal: ISequencedProposal) => void,
	);

	/**
	 * @deprecated No replacement API recommended.
	 */
	(event: "contextChanged", listener: (codeDetails: IFluidCodeDetails) => void);

	/**
	 * Emitted when the {@link IContainer} becomes disconnected from the Fluid service.
	 *
	 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
	 *
	 * @see
	 *
	 * - {@link IContainer.connectionState}
	 *
	 * - {@link IContainer.disconnect}
	 */
	(event: "disconnected", listener: () => void);

	/**
	 * Emitted when a {@link AttachState.Detached | detached} container begins the process of
	 * {@link AttachState.Attaching | attached} to the Fluid service.
	 *
	 * @see
	 *
	 * - {@link IContainer.attachState}
	 *
	 * - {@link IContainer.attach}
	 */
	(event: "attaching", listener: () => void);

	/**
	 * Emitted when the {@link AttachState.Attaching | attaching} process is complete and the container is
	 * {@link AttachState.Attached | attached} to the Fluid service.
	 *
	 * @see
	 *
	 * - {@link IContainer.attachState}
	 *
	 * - {@link IContainer.attach}
	 */
	(event: "attached", listener: () => void);

	/**
	 * Emitted when the {@link IContainer} is closed, which permanently disables it.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `error`: If the container was closed due to error, this will contain details about the error that caused it.
	 *
	 * @see {@link IContainer.close}
	 */
	(event: "closed", listener: (error?: ICriticalContainerError) => void);

	/**
	 * Emitted when the {@link IContainer} is disposed, which permanently disables it.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `error`: If the container was disposed due to error, this will contain details about the error that caused it.
	 *
	 * @see {@link IContainer.dispose}
	 */
	(event: "disposed", listener: (error?: ICriticalContainerError) => void);

	/**
	 * Emitted when the container encounters a state which may lead to errors, which may be actionable by the consumer.
	 *
	 * @remarks
	 *
	 * Note: this event is not intended for general use.
	 * The longer-term intention is to surface warnings more directly on the APIs that produce them.
	 * For now, use of this should be avoided when possible.
	 *
	 * Listener parameters:
	 *
	 * - `error`: The warning describing the encountered state.
	 */
	(event: "warning", listener: (error: ContainerWarning) => void);

	/**
	 * Emitted immediately after processing an incoming operation (op).
	 *
	 * @remarks
	 *
	 * Note: this event is not intended for general use.
	 * Prefer to listen to events on the appropriate ultimate recipients of the ops, rather than listening to the
	 * ops directly on the {@link IContainer}.
	 *
	 * Listener parameters:
	 *
	 * - `message`: The op that was processed.
	 */
	(event: "op", listener: (message: ISequencedDocumentMessage) => void);

	/**
	 * Emitted upon the first local change while the Container is in the "saved" state.
	 * That is, when {@link IContainer.isDirty} transitions from `true` to `false`.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `dirty`: DEPRECATED. This parameter will be removed in a future release.
	 *
	 * @see {@link IContainer.isDirty}
	 */
	(event: "dirty", listener: (dirty: boolean) => void);

	/**
	 * Emitted when all local changes/edits have been acknowledged by the service.
	 * I.e., when {@link IContainer.isDirty} transitions from `false` to `true`.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `dirty`: DEPRECATED. This parameter will be removed in a future release.
	 *
	 * @see {@link IContainer.isDirty}
	 */
	(event: "saved", listener: (dirty: boolean) => void);
}

/**
 * Namespace for the different connection states a container can be in.
 * PLEASE NOTE: The sequence of the numerical values does no correspond to the typical connection state progression.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ConnectionState {
	/**
	 * The container is not connected to the delta server.
	 * Note - When in this state the container may be about to reconnect,
	 * or may remain disconnected until explicitly told to connect.
	 */
	export type Disconnected = 0;

	/**
	 * The container is disconnected but actively trying to establish a new connection.
	 * PLEASE NOTE that this numerical value falls out of the order you may expect for this state.
	 */
	export type EstablishingConnection = 3;

	/**
	 * The container has an inbound connection only, and is catching up to the latest known state from the service.
	 */
	export type CatchingUp = 1;

	/**
	 * The container is fully connected and syncing.
	 */
	export type Connected = 2;
}

/**
 * Type defining the different states of connectivity a Container can be in.
 */
export type ConnectionState =
	| ConnectionState.Disconnected
	| ConnectionState.EstablishingConnection
	| ConnectionState.CatchingUp
	| ConnectionState.Connected;

/**
 * The Host's view of a Container and its connection to storage
 */
export interface IContainer extends IEventProvider<IContainerEvents>, IFluidRouter {
	/**
	 * The Delta Manager supporting the op stream for this Container
	 */
	deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

	/**
	 * The collection of write clients which were connected as of the current sequence number.
	 * Also contains a map of key-value pairs that must be agreed upon by all clients before being accepted.
	 */
	getQuorum(): IQuorumClients;

	/**
	 * Represents the resolved url to the Container.
	 * Will be undefined only when the container is in the {@link AttachState.Detached | detatched} state.
	 */
	resolvedUrl: IResolvedUrl | undefined;

	/**
	 * Indicates the attachment state of the container to a host service.
	 */
	readonly attachState: AttachState;

	/**
	 * Get the code details that are currently specified for the container.
	 * @returns The current code details if any are specified, undefined if none are specified.
	 */
	getSpecifiedCodeDetails(): IFluidCodeDetails | undefined;

	/**
	 * Get the code details that were used to load the container.
	 * @returns The code details that were used to load the container if it is loaded, undefined if it is not yet
	 * loaded.
	 */
	getLoadedCodeDetails(): IFluidCodeDetails | undefined;

	/**
	 * Returns true if the container has been closed, otherwise false.
	 */
	readonly closed: boolean;

	/**
	 * Whether or not there are any local changes that have not been saved.
	 */
	readonly isDirty: boolean;

	/**
	 * Disposes the container. If not already closed, this acts as a closure and then disposes runtime resources.
	 * The container is not expected to be used anymore once it is disposed.
	 *
	 * @param error - If the container is being disposed due to error, this provides details about the error that
	 * resulted in disposing it.
	 */
	dispose(error?: ICriticalContainerError): void;

	/**
	 * Closes the container.
	 *
	 * @param error - If the container is being closed due to error, this provides details about the error that
	 * resulted in closing it.
	 */
	close(error?: ICriticalContainerError): void;

	/**
	 * Closes the container and returns serialized local state intended to be
	 * given to a newly loaded container.
	 * @experimental
	 * {@link https://github.com/microsoft/FluidFramework/blob/main/packages/loader/container-loader/closeAndGetPendingLocalState.md}
	 */
	closeAndGetPendingLocalState(): string;

	/**
	 * Propose new code details that define the code to be loaded for this container's runtime.
	 *
	 * The returned promise will be true when the proposal is accepted, and false if the proposal is rejected.
	 */
	proposeCodeDetails(codeDetails: IFluidCodeDetails): Promise<boolean>;

	/**
	 * Attaches the Container to the Container specified by the given Request.
	 *
	 * @privateRemarks
	 *
	 * TODO - in the case of failure options should give a retry policy.
	 * Or some continuation function that allows attachment to a secondary document.
	 */
	attach(request: IRequest): Promise<void>;

	/**
	 * Extract a snapshot of the container as long as it is in detached state. Calling this on an attached container
	 * is an error.
	 */
	serialize(): string;

	/**
	 * Get an absolute URL for a provided container-relative request URL.
	 * If the container is not attached, this will return undefined.
	 *
	 * @param relativeUrl - A container-relative request URL.
	 */
	getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;

	/**
	 * Issue a request against the container for a resource.
	 * @param request - The request to be issued against the container
	 */
	request(request: IRequest): Promise<IResponse>;

	/**
	 * Provides the current state of the container's connection to the ordering service.
	 *
	 * @remarks Consumers can listen for state changes via the "connected" and "disconnected" events.
	 */
	readonly connectionState: ConnectionState;

	/**
	 * Attempts to connect the container to the delta stream and process ops.
	 *
	 * @remarks
	 *
	 * {@link IContainer.connectionState} will be set to {@link (ConnectionState:namespace).Connected}, and the
	 * "connected" event will be fired if/when connection succeeds.
	 */
	connect(): void;

	/**
	 * Disconnects the container from the delta stream and stops processing ops.
	 *
	 * @remarks
	 *
	 * {@link IContainer.connectionState} will be set to {@link (ConnectionState:namespace).Disconnected}, and the
	 * "disconnected" event will be fired when disconnection completes.
	 */
	disconnect(): void;

	/**
	 * The audience information for all clients currently associated with the document in the current session.
	 */
	readonly audience: IAudience;

	/**
	 * The server provided ID of the client.
	 *
	 * Set once {@link IContainer.connectionState} is {@link (ConnectionState:namespace).Connected},
	 * otherwise will be `undefined`.
	 */
	readonly clientId?: string | undefined;

	/**
	 * Tells if container is in read-only mode.
	 *
	 * @remarks
	 *
	 * Data stores should listen for "readonly" notifications and disallow user making changes to data stores.
	 * Readonly state can be because of no storage write permission,
	 * or due to host forcing readonly mode for container.
	 *
	 * We do not differentiate here between no write access to storage vs. host disallowing changes to container -
	 * in all cases container runtime and data stores should respect readonly state and not allow local changes.
	 *
	 * It is undefined if we have not yet established websocket connection
	 * and do not know if user has write access to a file.
	 */
	readonly readOnlyInfo: ReadOnlyInfo;

	/**
	 * Allows the host to have the container force to be in read-only mode
	 * @param readonly - Boolean that toggles if read-only policies will be enforced
	 * @alpha
	 */
	forceReadonly?(readonly: boolean);

	/**
	 * Exposes the entryPoint for the container.
	 * Use this as the primary way of getting access to the user-defined logic within the container.
	 * If the method is undefined or the returned promise returns undefined (meaning that exposing the entryPoint
	 * hasn't been implemented in a particular scenario) fall back to the current approach of requesting the default
	 * object of the container through the request pattern.
	 *
	 * @remarks The plan is that eventually IContainer will no longer implement IFluidRouter (and thus won't have a
	 * request() method), this method will no longer be optional, and it will become the only way to access
	 * the entryPoint for the container.
	 */
	getEntryPoint?(): Promise<FluidObject | undefined>;
}

/**
 * The Runtime's view of the Loader, used for loading Containers
 */
export interface ILoader extends IFluidRouter, Partial<IProvideLoader> {
	/**
	 * Resolves the resource specified by the URL + headers contained in the request object
	 * to the underlying container that will resolve the request.
	 *
	 * @remarks
	 *
	 * An analogy for this is resolve is a DNS resolve of a Fluid container. Request then executes
	 * a request against the server found from the resolve step.
	 */
	resolve(request: IRequest, pendingLocalState?: string): Promise<IContainer>;
}

/**
 * The Host's view of the Loader, used for loading Containers
 */
export interface IHostLoader extends ILoader {
	/**
	 * Creates a new container using the specified chaincode but in an unattached state. While unattached all
	 * updates will only be local until the user explicitly attaches the container to a service provider.
	 */
	createDetachedContainer(codeDetails: IFluidCodeDetails): Promise<IContainer>;

	/**
	 * Creates a new container using the specified snapshot but in an unattached state. While unattached all
	 * updates will only be local until the user explicitly attaches the container to a service provider.
	 */
	rehydrateDetachedContainerFromSnapshot(snapshot: string): Promise<IContainer>;
}

export type ILoaderOptions = {
	[key in string | number]: any;
} & {
	/**
	 * Set caching behavior for the loader. If true, we will load a container from cache if one
	 * with the same id/version exists or create a new container and cache it if it does not. If
	 * false, always load a new container and don't cache it. If the container has already been
	 * closed, it will not be cached. A cache option in the LoaderHeader for an individual
	 * request will override the Loader's value.
	 * Defaults to true.
	 */
	cache?: boolean;

	/**
	 * Provide the current Loader through the scope object when creating Containers. It is added
	 * as the `ILoader` property, and will overwrite an existing property of the same name on the
	 * scope. Useful for when the host wants to provide the current Loader's functionality to
	 * individual Data Stores, which is typically expected when creating with a Loader.
	 * Defaults to true.
	 */
	provideScopeLoader?: boolean;

	/**
	 * Max time (in ms) container will wait for a leave message of a disconnected client.
	 */
	maxClientLeaveWaitTime?: number;
};

/**
 * Accepted header keys for requests coming to the Loader
 */
export enum LoaderHeader {
	/**
	 * @deprecated In next release, all caching functionality will be removed, and this is not useful anymore
	 * Override the Loader's default caching behavior for this container.
	 */
	cache = "fluid-cache",

	clientDetails = "fluid-client-details",

	/**
	 * Start the container in a paused, unconnected state. Defaults to false
	 */
	loadMode = "loadMode",
	reconnect = "fluid-reconnect",
	sequenceNumber = "fluid-sequence-number",

	/**
	 * One of the following:
	 * null or "null": use ops, no snapshots
	 * undefined: fetch latest snapshot
	 * otherwise, version sha to load snapshot
	 */
	version = "version",
}

export interface IContainerLoadMode {
	opsBeforeReturn?: /*
	 * No trailing ops are applied before container is returned.
	 * Default value.
	 */
	| undefined
		/*
		 * Only cached trailing ops are applied before returning container.
		 * Caching is optional and could be implemented by the driver.
		 * If driver does not implement any kind of local caching strategy, this is same as above.
		 * Driver may cache a lot of ops, so care needs to be exercised (see below).
		 */
		| "cached"
		/*
		 * All trailing ops in storage are fetched and applied before container is returned
		 * This mode might have significant impact on boot speed (depends on storage perf characteristics)
		 * Also there might be a lot of trailing ops and applying them might take time, so hosts are
		 * recommended to have some progress UX / cancellation built into loading flow when using this option.
		 */
		| "all";

	deltaConnection?: /*
	 * Connection to delta stream is made only when Container.connect() call is made. Op processing
	 * is paused (when container is returned from Loader.resolve()) until Container.connect() call is made.
	 */
	| "none"
		/*
		 * Connection to delta stream is made only when Container.connect() call is made.
		 * Op fetching from storage is performed and ops are applied as they come in.
		 * This is useful option if connection to delta stream is expensive and thus it's beneficial to move it
		 * out from critical boot sequence, but it's beneficial to allow catch up to happen as fast as possible.
		 */
		| "delayed"
		/*
		 * Connection to delta stream is made right away.
		 * Ops processing is enabled and ops are flowing through the system.
		 * Default value.
		 */
		| undefined;

	freezeAtSeqNum?: /*
	 * Container loads normally. Default value
	 */
	| undefined
		/*
		 * Container is loaded at the specified sequence number and will not receive any additional ops.
		 * TODO: Avoid collision with other load modes
		 */
		| number;
}

/**
 * Set of Request Headers that the Loader understands and may inspect or modify
 */
export interface ILoaderHeader {
	/**
	 * @deprecated In next release, all caching functionality will be removed, and this is not useful anymore
	 */
	[LoaderHeader.cache]: boolean;
	[LoaderHeader.clientDetails]: IClientDetails;
	[LoaderHeader.loadMode]: IContainerLoadMode;
	[LoaderHeader.sequenceNumber]: number;
	[LoaderHeader.reconnect]: boolean;
	[LoaderHeader.version]: string | undefined;
}

export interface IProvideLoader {
	readonly ILoader: ILoader;
}

/**
 * @deprecated 0.48, This API will be removed in 0.50
 * No replacement since it is not expected anyone will depend on this outside container-loader
 * See {@link https://github.com/microsoft/FluidFramework/issues/9711} for context.
 */
export interface IPendingLocalState {
	url: string;
	pendingRuntimeState: unknown;
}

/**
 * This is used when we rehydrate a container from the snapshot. Here we put the blob contents
 * in separate property: {@link ISnapshotTreeWithBlobContents.blobsContents}.
 *
 * @remarks This is used as the `ContainerContext`'s base snapshot when attaching.
 */
export interface ISnapshotTreeWithBlobContents extends ISnapshotTree {
	blobsContents: { [path: string]: ArrayBufferLike };
	trees: { [path: string]: ISnapshotTreeWithBlobContents };
}
