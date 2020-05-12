/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    IClientDetails,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { IError, IResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { IEvent, IEventProvider } from "@microsoft/fluid-common-definitions";
import { IFluidCodeDetails, IFluidModule, IFluidPackage } from "./chaincode";
import { IDeltaManager } from "./deltas";

/**
 * Code loading interface
 */
export interface ICodeLoader {
    /**
     * Loads the package specified by IPackage and returns a promise to its entry point exports.
     */
    load(source: IFluidCodeDetails): Promise<IFluidModule>;
}

/**
* The interface returned from a IFluidCodeResolver which represents IFluidCodeDetails
 * that have been resolved and are ready to load
 */
export interface IResolvedFluidCodeDetails extends IFluidCodeDetails {
    /**
     * A resolved version of the fluid package. All fluid browser file entries should be absolute urls.
     */
    resolvedPackage: IFluidPackage;
    /**
     * If not undefined, this id will be used to cache the entry point for the code package
     */
    resolvedPackageCacheId: string | undefined;
}

/**
 * Fluid code resolvers take a fluid code details, and resolve the
 * full fuild package including absolute urls for the browser file entries.
 * The fluid code resolver is coupled to a specific cdn and knows how to resolve
 * the code detail for loading from that cdn. This include resolving to the most recent
 * version of package that supports the provided code details.
 */
export interface IFluidCodeResolver{
    /**
     * Resolves a fluid code details into a form that can be loaded
     * @param details - The fluid code details to resolve
     * @returns - A IResolvedFluidCodeDetails where the
     *            resolvedPackage's fluid file entries are absolute urls, and
     *            an optional resolvedPackageCacheId if the loaded package should be
     *            cached.
     */
    resolveCodeDetails(details: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails>;
}

/**
 * Code WhiteListing Interface
 */
export interface ICodeWhiteList {
    testSource(source: IResolvedFluidCodeDetails): Promise<boolean>;
}

export interface IContainerEvents extends IEvent {
    (event: "readonly", listener: (readonly: boolean) => void): void;
    (event: "connected" | "contextChanged", listener: (clientId: string) => void);
    (event: "disconnected" | "joining", listener: () => void);
    (event: "closed", listener: (error?: IError) => void);
    (event: "error", listener: (error: IError) => void);
    (event: "op", listener: (message: ISequencedDocumentMessage) => void);
    (event: "pong" | "processTime", listener: (latency: number) => void);
    (event: MessageType.BlobUploaded, listener: (contents: any) => void);
}

export interface IContainer extends IEventProvider<IContainerEvents> {

    deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

    getQuorum(): IQuorum;

    /**
     * Represents the resolved url to the container.
     */
    resolvedUrl: IResolvedUrl | undefined;

    /**
     * Flag indicating if the given container has been attached to a host service.
     */
    isLocal(): boolean;

    /**
     * Attaches the container to the provided host.
     *
     * TODO - in the case of failure options should give a retry policy. Or some continuation function
     * that allows attachment to a secondary document.
     */
    attach(request: IRequest): Promise<void>;
}

export interface ILoader {

    /**
     * Loads the resource specified by the URL + headers contained in the request object.
     */
    request(request: IRequest): Promise<IResponse>;

    /**
     * Resolves the resource specified by the URL + headers contained in the request object
     * to the underlying container that will resolve the request.
     *
     * An analogy for this is resolve is a DNS resolve of a Fluid container. Request then executes
     * a request against the server found from the resolve step.
     */
    resolve(request: IRequest): Promise<IContainer>;

    /**
     * Creates a new contanier using the specified chaincode but in an unattached state. While unattached all
     * updates will only be local until the user explciitly attaches the container to a service provider.
     */
    createDetachedContainer(source: IFluidCodeDetails): Promise<IContainer>;
}

export enum LoaderHeader {
    /**
     * Use cache for this container. If true, we will load a container from cache if one with the same id/version exists
     * or create a new container and cache it if it does not. If false, always load a new container and don't cache it.
     * Currently only used to opt-out of caching, as it will default to true but will be false (even if specified as
     * true) if the reconnect header is false or the pause header is true, since these containers should not be cached.
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
export interface ILoaderHeader {
    [LoaderHeader.cache]: boolean;
    [LoaderHeader.clientDetails]: IClientDetails;
    [LoaderHeader.pause]: boolean;
    [LoaderHeader.executionContext]: string;
    [LoaderHeader.sequenceNumber]: number;
    [LoaderHeader.reconnect]: boolean;
    [LoaderHeader.version]: string | undefined | null;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IRequestHeader extends Partial<ILoaderHeader> { }
}
