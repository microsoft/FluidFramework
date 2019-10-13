/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IDocumentMessage, ISequencedDocumentMessage, IUrlResolver } from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";
import { IFluidCodeDetails } from "./chaincode";
import { IQuorum } from "./consensus";
import { IDeltaManager } from "./deltas";

/**
 * Code loading interface
 */
export interface ICodeLoader {
    /**
     * Loads the package specified by IPackage and returns a promise to its entry point exports.
     */
    load<T>(source: IFluidCodeDetails): Promise<T>;
}

/**
 * Code WhiteListing Interface
 */
export interface ICodeWhiteList {
    testSource(source: IFluidCodeDetails): Promise<boolean>;
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
