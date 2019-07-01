/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IComponent } from "./components";
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
     * This definition will expand. A document likely stores a published package for the document within it. And that
     * package then goes and refers to other stuff. The base package will have the ability to pull in, install
     * data contained in the document.
     */
    load<T>(source: string): Promise<T>;
}

export type IResolvedUrl = IWebResolvedUrl | IPragueResolvedUrl;

export interface IResolvedUrlBase {
    type: string;
}

export interface IWebResolvedUrl extends IResolvedUrlBase {
    type: "web";
    data: string;
}

export interface IPragueResolvedUrl extends IResolvedUrlBase {
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

export interface IRequest {
    url: string;
    headers?: { [key: string]: any };
}

export interface IResponse {
    mimeType: string;
    status: number;
    value: any;
    headers?: { [key: string]: any };
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
     * An analogy for this is resolve is a DNS resolve of a Prague container. Request then executes
     * a request against the server found from the resolve step.
     */
    resolve(request: IRequest): Promise<IContainer>;
}
