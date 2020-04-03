/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    IClientDetails,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";
import { NewFileParams } from "@microsoft/fluid-driver-definitions";
import { IFluidCodeDetails, IFluidModule } from "./chaincode";
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
 * Code WhiteListing Interface
 */
export interface ICodeWhiteList {
    testSource(source: IFluidCodeDetails): Promise<boolean>;
}

export interface IContainer extends EventEmitter {

    deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

    getQuorum(): IQuorum;
}

export interface IExperimentalContainer extends IContainer {

    isExperimentalContainer: true;

    /**
     * Provides the URL to the created container.
     */
    containerUrl: string | undefined;

    /**
     * Flag indicating if the given container has been attached to a host service.
     */
    isAttached(): boolean;

    /**
     * Attaches the container to the provided host.
     *
     * TODO - in the case of failure options should give a retry policy. Or some continuation function
     * that allows attachment to a secondary document.
     */
    attach(request: IRequest, newFileParams: NewFileParams): Promise<void>;
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
}

export interface IExperimentalLoader extends ILoader {

    isExperimentalLoader: true;

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
