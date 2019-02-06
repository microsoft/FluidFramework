import {
    ConnectionState,
    IBlobManager,
    IDeltaManager,
    IDocumentStorageService,
    IPlatform,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IUser,
} from "@prague/container-definitions";

export interface IComponentDeltaHandler {
    prepare: (message: ISequencedDocumentMessage, local: boolean) => Promise<any>;
    process: (message: ISequencedDocumentMessage, local: boolean, context: any) => void;
    updateMinSequenceNumber: (value: number) => void;
    changeConnectionState(value: ConnectionState, clientId: string);
    request(request: IRequest): Promise<IResponse>;
}

/**
 * The platform interface exposes access to underlying pl
 */
export interface IComponentPlatform extends IPlatform {
    /**
     * Detaches the given platform
     */
    detach();
}

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

    // TODO it's not clear what platform is passed on load. Does it get access to the platform given to the context?
    // or the actual host platform?
    /**
     * Invoked once the chaincode has been fully instantiated on the document. Run returns a platform
     * interface that can be used to access the running component.
     */
    run(runtime: IComponentRuntime, platform: IPlatform): Promise<IComponentDeltaHandler>;

    /**
     * Allows code to attach to the given component.
     */
    attach(platform: IComponentPlatform): Promise<IComponentPlatform>;

    /**
     * Generates a snapshot of the given component
     */
    snapshot(): ITree;
}

export interface IComponentRuntime {
    readonly tenantId: string;
    readonly documentId: string;
    readonly id: string;
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string;
    readonly user: IUser;
    readonly parentBranch: string;
    readonly connected: boolean;
    readonly deltaManager: IDeltaManager;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly minimumSequenceNumber: number;
    readonly chaincode: IChaincodeComponent;
    readonly baseSnapshot: ISnapshotTree;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;

    // I believe these next two things won't be necessary

    getQuorum(): IQuorum;

    error(err: any): void;

    submitMessage(type: string, content: any): any;

    createAndAttachProcess(id: string, pkg: string): Promise<IComponentRuntime>;

    getProcess(id: string, wait: boolean): Promise<IComponentRuntime>;

    /**
     * Allows for attachment to the given component
     */
    attach(platform: IComponentPlatform): Promise<IComponentPlatform>;

    request(request: IRequest): Promise<IResponse>;
}
