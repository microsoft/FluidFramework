import {
    ConnectionState,
    IBlobManager,
    IDeltaManager,
    IDocumentStorageService,
    IQuorum,
    IUser,
    MessageType,
} from "@prague/container-definitions";
import {
    IChaincodeComponent,
    IComponentRuntime,
    IRuntime,
} from "@prague/runtime-definitions";

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

    registerTasks(tasks: string[], version?: string);
}

export interface IComponentFactory {
    instantiateComponent(): Promise<IChaincodeComponent>;
}
