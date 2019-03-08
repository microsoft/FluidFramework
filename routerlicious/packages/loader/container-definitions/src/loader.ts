import { EventEmitter } from "events";
import { IChaincodeFactory } from "./chaincode";
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
    load(source: string): Promise<IChaincodeFactory>;
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
    ordererUrl: string;
    storageUrl: string;
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
}

export interface IResponse {
    mimeType: string;
    status: number;
    value: any;
}

export interface IContainer extends EventEmitter {
    deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
}

export interface ILoader {
    request(request: IRequest): Promise<IResponse>;

    resolve(request: IRequest): Promise<IContainer>;
}
