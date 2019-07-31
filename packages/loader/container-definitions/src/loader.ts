/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IRequest, IResponse } from "@prague/component-core-interfaces";
import { EventEmitter } from "events";
import { IFluidCodeDetails } from "./chaincode";
import { IQuorum } from "./consensus";
import { IDeltaManager } from "./deltas";
import { IDocumentMessage, ISequencedDocumentMessage } from "./protocol";

/**
 * Code loading interface
 */
export interface ICodeLoader {
    /**
     * Loads the package specified by IPackage and returns a promise to its entry point exports.
     *
     * details is provided for backwards compatibility. Until 0.7 source will continue to be a string and
     * details will contain the object. But the loader will be updated to check to see if the object is in
     * source first.
     */
    load<T>(source: string | IFluidCodeDetails, details?: IFluidCodeDetails): Promise<T>;
}

export type IResolvedUrl = IWebResolvedUrl | IFluidResolvedUrl;

export interface IResolvedUrlBase {
    type: string;
}

export interface IWebResolvedUrl extends IResolvedUrlBase {
    type: "web";
    data: string;
}

export interface IFluidResolvedUrl extends IResolvedUrlBase {
    type: "prague";
    url: string;
    tokens: { [name: string]: string };
    endpoints: { [name: string]: string };
}

export interface IUrlResolver {
    // Like DNS should be able to cache resolution requests. Then possibly just have a token provider go and do stuff?
    // the expiration of it could be relative to the lifetime of the token? Requests after need to refresh?
    // or do we split the token access from this?
    resolve(request: IRequest): Promise<IResolvedUrl>;
}

/**
 * Host provider interfaces
 */
export interface IHost {
    resolver: IUrlResolver;
}

export interface IContainer extends EventEmitter {
    deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

    getQuorum(): IQuorum;
}

export interface ILoader extends IComponent {
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
