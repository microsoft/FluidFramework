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
    MessageType,
} from "@prague/container-definitions";
import { IRuntime } from "@prague/runtime-definitions";

export interface IDeltaHandler {
    prepare: (message: ISequencedDocumentMessage, local: boolean) => Promise<any>;
    process: (message: ISequencedDocumentMessage, local: boolean, context: any) => void;
    updateMinSequenceNumber: (value: number) => void;
    changeConnectionState(value: ConnectionState, clientId: string);
    request(request: IRequest): Promise<IResponse>;
}

export interface ILegacyRuntime extends IRuntime {
    createAndAttachProcess(id: string, pkg: string): Promise<IComponentRuntime>;
    getProcess(id: string, wait: boolean): Promise<IComponentRuntime>;
}

export interface IHostRuntime {
    // TODOTODO do I also need the component ID? Does the tenant ID even show up?
    readonly tenantId: string;
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
    readonly submitFn: (type: MessageType, contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;

    // I believe these next two things won't be necessary

    getProcess(id: string, wait?: boolean): Promise<IComponentRuntime>;

    createAndAttachProcess(id: string, pkg: string): Promise<IComponentRuntime>;

    // TODO at some point we may ant to split create from attach for processes. But the distributed data
    // structures aren't yet prepared for this. For simplicity we just offer a createAndAttach
    // attachProcess(process: IProcess);

    getQuorum(): IQuorum;

    error(err: any): void;
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

export interface IComponentFactory {
    instantiateComponent(): Promise<IChaincodeComponent>;
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
    run(runtime: IComponentRuntime, platform: IPlatform): Promise<IDeltaHandler>;

    /**
     * Allows code to attach to the given component.
     */
    attach(platform: IComponentPlatform): Promise<IComponentPlatform>;

    /**
     * Generates a snapshot of the given component
     */
    snapshot(): ITree;
}
