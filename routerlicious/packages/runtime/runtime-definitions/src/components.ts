import {
    ConnectionState,
    IBlobManager,
    IDeltaManager,
    IDocumentMessage,
    IDocumentStorageService,
    ILoader,
    IPlatform,
    IQuorum,
    IRequest,
    IResponse,
    IRuntime,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@prague/container-definitions";

export interface IComponentDeltaHandler {
    prepare: (message: ISequencedDocumentMessage, local: boolean) => Promise<any>;
    process: (message: ISequencedDocumentMessage, local: boolean, context: any) => void;
    changeConnectionState(value: ConnectionState, clientId: string);
    request(request: IRequest): Promise<IResponse>;
}

export interface IChaincodeComponent {
    // I'm not sure how many of the below we'll even need
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
    run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler>;

    /**
     * Allows code to attach to the given component.
     */
    attach(platform: IPlatform): Promise<IPlatform>;

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
    readonly clientType: string;
    readonly parentBranch: string;
    readonly connected: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly chaincode: IChaincodeComponent;
    readonly baseSnapshot: ISnapshotTree;
    readonly loader: ILoader;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;

    // I believe these next two things won't be necessary

    getQuorum(): IQuorum;

    error(err: any): void;

    submitMessage(type: string, content: any): number;

    createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime>;

    getComponent(id: string, wait: boolean): Promise<IComponentRuntime>;

    /**
     * Allows for attachment to the given component
     */
    attach(platform: IPlatform): Promise<IPlatform>;

    request(request: IRequest): Promise<IResponse>;
}

export interface IHostRuntime extends IRuntime {
    // TODOTODO do I also need the component ID? Does the tenant ID even show up?
    readonly tenantId: string;
    readonly id: string;
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string;
    readonly clientType: string;
    readonly parentBranch: string;
    readonly connected: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly minimumSequenceNumber: number;
    readonly loader: ILoader;
    readonly submitFn: (type: MessageType, contents: any) => number;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;

    // I believe these next two things won't be necessary

    getComponent(id: string, wait?: boolean): Promise<IComponentRuntime>;

    createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime>;

    // TODO at some point we may ant to split create from attach for processes. But the distributed data
    // structures aren't yet prepared for this. For simplicity we just offer a createAndAttach
    // attachProcess(process: IProcess);

    getQuorum(): IQuorum;

    getPackage(name: string): Promise<IComponentFactory>;

    error(err: any): void;
}

export interface IComponentFactory {
    instantiateComponent(): Promise<IChaincodeComponent>;
}
