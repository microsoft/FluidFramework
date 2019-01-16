import { IObjectMessage, IPlatform, IRuntime, ITree } from "@prague/runtime-definitions";

export interface IChaincodeComponent {
    // I'm not sure how many of the below we'll even need

    /**
     * Retrieves the module by type name
     */
    getModule(type: string);

    /**
     * Stops the instantiated chaincode from running
     */
    close(): Promise<void>;

    /**
     * Invoked once the chaincode has been fully instantiated on the document. Run returns a platform
     * interface that can be used to access the running component.
     */
    run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform>;
}

export interface IHostRuntime {
}

export interface IChaincodeHost {
    /**
     * Retrieves the module by type name
     */
    getModule(type: string): Promise<any>;

    /**
     * Stops the instantiated chaincode from running
     */
    close(): Promise<void>;

    /**
     * Invoked once the chaincode has been fully instantiated on the document. Run returns a platform
     * interface that can be used to access the running component.
     */
    // When loading multiple of these the platform is interesting. Is this something that gets attached as opposed
    // to returned? Is there then a detach call?
    run(runtime: IHostRuntime, platform: IPlatform): Promise<IPlatform>;
}

/**
 * Exported module definition
 */
export interface IChaincodeFactory {
    // We're really loading an instruction set into our CPU. Does that give better names?
    // The base thing preps the instruction set loader. Then each component delay loads aspects of it.

    /**
     * Instantiates a new chaincode component
     */
    instantiateComponent(): Promise<IChaincodeComponent>;

    /**
     * Instantiates a new chaincode host
     */
    instantiateHost(): Promise<IChaincodeHost>;
}

export interface IChannel {
    /**
     * A readonly identifier for the collaborative object
     */
    readonly id: string;

    readonly type: string;

    dirty: boolean;

    ready(): Promise<void>;

    snapshot(): ITree;

    transform(message: IObjectMessage, sequenceNumber: number): IObjectMessage;

    isLocal(): boolean;
}
