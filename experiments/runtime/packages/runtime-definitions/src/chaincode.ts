import { IRuntime } from "./runtime";

export interface IChaincode {
    /**
     * Stops the instantiated chaincode from running
     */
    close(): Promise<void>;

    // Does the chaincode query the runtime with events/callbacks...?
    // Or does the loader be more active in use and there is some kind of "load" here?
}

/**
 * Exported module definition
 */
export interface IChaincodeFactory {
    /**
     * Instantiates a new instance of the chaincode against the given runtime
     */
    instantiate(runtime: IRuntime): Promise<IChaincode>;
}
