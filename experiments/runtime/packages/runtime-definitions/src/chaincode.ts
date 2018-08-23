import { IRuntime } from "./runtime";

export interface IChaincode {
    /**
     * Stops the instantiated chaincode from running
     */
    close(): Promise<void>;
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
