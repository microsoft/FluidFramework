import { IChaincodeFactory } from "./chaincode";
import { ITokenProvider } from "./tokens";
import { IUser } from "./users";

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

/**
 * Host provider interfaces
 */
export interface IHost {
    tokenProvider: ITokenProvider;

    user: IUser;
}

export interface IRequest {
    url: string;
}

export interface IResponse {
    mimeType: string;
    status: number;
    value: any;
}
