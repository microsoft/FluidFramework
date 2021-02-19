/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
    /**
     * @param opsBehind - number of ops this client is behind (if present).
     */
    (event: "connect", listener: (opsBehind?: number) => void);
    (event: "codeDetailsProposed", listener: (codeDetails: IFluidCodeDetails, proposal: IPendingProposal) => void);
    (event: "contextDisposed" | "contextChanged",
        listener: (codeDetails: IFluidCodeDetails, previousCodeDetails: IFluidCodeDetails | undefined) => void);
    (event: "disconnected" | "attaching" | "attached", listener: () => void);
    (event: "closed", listener: (error?: ICriticalContainerError) => void);
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
 * The Host's view of the Loader, used for loading Containers
 */
export interface ILoader extends IFluidRouter {
    /**
     * Resolves the resource specified by the URL + headers contained in the request object
     * to the underlying container that will resolve the request.
     *
     * An analogy for this is resolve is a DNS resolve of a Fluid container. Request then executes
     * a request against the server found from the resolve step.
     */
    resolve(request: IRequest): Promise<IContainer>;

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
     * Affects the behavior of the Container when a new code proposal
     * is accepted that the current loaded code does not satisfy.
     * True to reload the context without closing the container, or
     * false to only close the container.
     * Defaults to false.
     */
    hotSwapContext?: boolean;

    /**
     * Set caching behavior for the loader.  If true, we will load a container from cache if one
     * with the same id/version exists or create a new container and cache it if it does not. If
     * false, always load a new container and don't cache it. If the container has already been
     * closed, it will not be cached.  A cache option in the LoaderHeader for an individual
     * request will override the Loader's value.
     * Defaults to true.
     */
    cache?: boolean;
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
    executionContext = "execution-context",

    /**
     * Start the container in a paused, unconnected state. Defaults to false
     */
    pause = "pause",
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

/**
 * Set of Request Headers that the Loader understands and may inspect or modify
 */
export interface ILoaderHeader {
    [LoaderHeader.cache]: boolean;
    [LoaderHeader.clientDetails]: IClientDetails;
    [LoaderHeader.pause]: boolean;
    [LoaderHeader.executionContext]: string;
    [LoaderHeader.sequenceNumber]: number;
    [LoaderHeader.reconnect]: boolean;
    [LoaderHeader.version]: string | undefined | null;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IRequestHeader extends Partial<ILoaderHeader> { }
}
