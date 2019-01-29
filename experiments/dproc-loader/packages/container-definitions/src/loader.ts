import { ITokenProvider, IUser } from "@prague/runtime-definitions";
import { IChaincodeFactory } from "./chaincode";

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

export interface IContainerHost {
    tokenProvider: ITokenProvider;

    user: IUser;
}
