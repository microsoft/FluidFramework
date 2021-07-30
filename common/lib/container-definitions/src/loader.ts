/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
    IResponse,
    IFluidRouter,
    IFluidCodeDetails,
    IFluidPackage,
    IProvideFluidCodeDetailsComparer,
} from "@fluidframework/core-interfaces";
import {
    IClientDetails,
    IDocumentMessage,
    IPendingProposal,
    IQuorum,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IDeltaManager } from "./deltas";
import { ICriticalContainerError, ContainerWarning } from "./error";
import { IFluidModule } from "./fluidModule";
import { AttachState } from "./runtime";

/**
 * Code loading interface
 *
 * @deprecated in favor of {@link @fluidframework/container-loader#ICodeDetailsLoader}
 */
export interface ICodeLoader extends Partial<IProvideFluidCodeDetailsComparer> {
    /**
     * Loads the package specified by code details and returns a promise to its entry point exports.
     */
    load(source: IFluidCodeDetails): Promise<IFluidModule>;
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
     * Resolves a Fluid code details into a form that can be loaded
     * @param details - The Fluid code details to resolve
     * @returns - A IResolvedFluidCodeDetails where the
     *            resolvedPackage's Fluid file entries are absolute urls, and
     *            an optional resolvedPackageCacheId if the loaded package should be
     *            cached.
     */
    resolveCodeDetails(details: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails>;
}

/**
 * Code AllowListing Interface
 */
export interface ICodeAllowList {
    testSource(source: IResolvedFluidCodeDetails): Promise<boolean>;
}

/**
 * Events emitted by the Container "upwards" to the Loader and Host
 */
export interface IContainerEvents extends IEvent {
    (event: "readonly", listener: (readonly: boolean) => void): void;
    (event: "connected", listener: (clientId: string) => void);
    (event: "codeDetailsProposed", listener: (codeDetails: IFluidCodeDetails, proposal: IPendingProposal) => void);
    (event: "contextChanged", listener: (codeDetails: IFluidCodeDetails) => void);
    (event: "disconnected" | "attached", listener: () => void);
    (event: "closed", listener: (reason: string, error?: ICriticalContainerError) => void);
    (event: "warning", listener: (error: ContainerWarning) => void);
    (event: "op", listener: (message: ISequencedDocumentMessage) => void);
    (event: "dirty" | "saved", listener: (dirty: boolean) => void);
}

/**
 * The Host's view of the Container and its connection to storage
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
    getQuorum(): IQuorum;

    /**
     * Represents the resolved url to the Container
     */
    resolvedUrl: IResolvedUrl | undefined;

    /**
     * Indicates the attachment state of the container to a host service.
     */
    readonly attachState: AttachState;

    /**
     * The current code details for the container's runtime
     */
    readonly codeDetails: IFluidCodeDetails | undefined

    /**
     * Returns true if the container has been closed, otherwise false
     */
    readonly closed: boolean;

    /**
     * Returns true if the container is dirty, i.e. there are user changes that has not been saved
     * Closing container in this state results in data loss for user.
     * Container usually gets into this situation due to loss of connectivity.
     */
    readonly isDirty: boolean;

    /**
     * Closes the container
     */
    close(error?: ICriticalContainerError): void;

    /**
     * Closes the container and returns serialized local state intended to be
     * given to a newly loaded container
     */
    closeAndGetPendingLocalState(): string;

    /**
     * Propose new code details that define the code to be loaded
     * for this container's runtime. The returned promise will
     * be true when the proposal is accepted, and false if
     * the proposal is rejected.
     */
    proposeCodeDetails(codeDetails: IFluidCodeDetails): Promise<boolean>

    /**
     * Attaches the Container to the Container specified by the given Request.
     *
     * TODO - in the case of failure options should give a retry policy. Or some continuation function
     * that allows attachment to a secondary document.
     */
    attach(request: IRequest): Promise<void>;

    /**
     * Extract the snapshot from the detached container.
     */
    serialize(): string;

    /**
     * Get an absolute url for a provided container-relative request url.
     * If the container is not attached, this will return undefined.
     *
     * @param relativeUrl - A container-relative request URL
     */
    getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;

    /**
     * Issue a request against the container for a resource.
     * @param request - The request to be issued against the container
     */
    request(request: IRequest): Promise<IResponse>;
}

/**
 * The Runtime's view of the Loader, used for loading Containers
 */
export interface ILoader extends IFluidRouter {
    /**
     * Resolves the resource specified by the URL + headers contained in the request object
     * to the underlying container that will resolve the request.
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
     * Set caching behavior for the loader.  If true, we will load a container from cache if one
     * with the same id/version exists or create a new container and cache it if it does not. If
     * false, always load a new container and don't cache it. If the container has already been
     * closed, it will not be cached.  A cache option in the LoaderHeader for an individual
     * request will override the Loader's value.
     * Defaults to true.
     */
    cache?: boolean;

    /**
     * Provide the current Loader through the scope object when creating Containers.  It is added
     * as the `ILoader` property, and will overwrite an existing property of the same name on the
     * scope.  Useful for when the host wants to provide the current Loader's functionality to
     * individual Data Stores, which is typically expected when creating with a Loader.
     * Defaults to true.
     */
    provideScopeLoader?: boolean;

    // Below two are the options based on which we decide how often client needs to send noops in case of active
    // connection which is not sending any op. The end result is the "AND" of these 2 options. So the client
    // should hit the min time and count to send the noop.
    /**
     * Set min time(in ms) frequency with which noops would be sent in case of active connection which is
     * not sending any op.
     */
    noopTimeFrequency?: number;

    /**
     * Set min op frequency with which noops would be sent in case of active connection which is not sending any op.
     */
    noopCountFrequency?: number;

    /**
     * Max time(in ms) container will wait for a leave message of a disconnected client.
    */
    maxClientLeaveWaitTime?: number,
};

/**
 * Accepted header keys for requests coming to the Loader
 */
export enum LoaderHeader {
    /**
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
    opsBeforeReturn?:
        /*
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
        | "all"
    deltaConnection?:
        /*
         * Connection to delta stream is made only when Container.resume() call is made. Op processing
         * is paused (when container is returned from Loader.resolve()) until Container.resume() call is made.
         */
        | "none"
        /*
         * Connection to delta stream is made only when Container.resume() call is made.
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
        | undefined
}

/**
 * Set of Request Headers that the Loader understands and may inspect or modify
 */
export interface ILoaderHeader {
    [LoaderHeader.cache]: boolean;
    [LoaderHeader.clientDetails]: IClientDetails;
    [LoaderHeader.loadMode]: IContainerLoadMode;
    [LoaderHeader.sequenceNumber]: number;
    [LoaderHeader.reconnect]: boolean;
    [LoaderHeader.version]: string | undefined;
}

interface IProvideLoader {
    readonly ILoader: ILoader;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IRequestHeader extends Partial<ILoaderHeader> { }

    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideLoader>> { }
}

export interface IPendingLocalState {
    url: string;
    pendingRuntimeState: unknown;
}
