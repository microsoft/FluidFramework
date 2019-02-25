import { IChaincodeFactory } from "./chaincode";
import { ITokenProvider } from "./tokens";

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

export interface IResolvedContainer {
    orderUrl: string;
    storageUrl: string;
    id: string;
    token: string;
    // Services as well?
}

export interface IContainerUrlResolver {
    // Like DNS should be able to cache resolution requests. Then possibly just have a token provider go and do stuff?
    // the expiration of it could be relative to the lifetime of the token? Requests after need to refresh?
    // or do we split the token access from this?
    resolve(request: IRequest): Promise<IResolvedContainer>;
}

/**
 * Host provider interfaces
 */
export interface IHost {
    tokenProvider: ITokenProvider;
    // resolver: IContainerUrlResolver;
}

export interface IRequest {
    url: string;
}

export interface IResponse {
    mimeType: string;
    status: number;
    value: any;
}

export interface ILoader {
    request(request: IRequest): Promise<IResponse>;
}
