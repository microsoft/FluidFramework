import { IChaincodeHost, IComponentContext, IContext } from "@prague/process-definitions";
import {
    ConnectionState,
    IDocumentStorageService,
    IPlatform,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import { BlobManager } from "./blobManager";
import { DeltaManager } from "./deltaManager";

export class Context implements IContext {
    public static async Load(
        tenantId: string,
        id: string,
        platform: IPlatform,
        parentBranch: string,
        existing: boolean,
        options: any,
        clientId: string,
        user: IUser,
        blobManager: BlobManager,
        chaincode: IChaincodeHost,
        deltaManager: DeltaManager,
        quorum: IQuorum,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        components: ISnapshotTree,
        blobs: Map<string, string>,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,
    ): Promise<Context> {
        const context = new Context(
            tenantId,
            id,
            platform,
            parentBranch,
            existing,
            options,
            clientId,
            user,
            blobManager,
            chaincode,
            deltaManager,
            quorum,
            storage,
            connectionState,
            components,
            blobs,
            branch,
            minimumSequenceNumber,
            submitFn,
            snapshotFn,
            closeFn);
        await context.start();

        // const submodulesP = Promise.all([storageP, treeP]).then(async ([storage, tree]) => {
        //     if (!tree || !tree.commits) {
        //         return new Map<string, ISnapshotTree>();
        //     }

        //     const snapshotTreesP = Object.keys(tree.commits).map(async (key) => {
        //         const moduleSha = tree.commits[key];
        //         const commit = (await storage.getVersions(moduleSha, 1))[0];
        //         const moduleTree = await storage.getSnapshotTree(commit);
        //         return { id: key, tree: moduleTree };
        //     });

        //     const submodules = new Map<string, ISnapshotTree>();
        //     const snapshotTree = await Promise.all(snapshotTreesP);
        //     for (const value of snapshotTree) {
        //         submodules.set(value.id, value.tree);
        //     }

        //     return submodules;
        // });

        return context;
    }

    public get clientId(): string {
        return this._clientId;
    }

    public get minimumSequenceNumber(): number {
        return this._minimumSequenceNumber;
    }

    public get connectionState(): ConnectionState {
        return this._connectionState;
    }

    private contextPlatform: IPlatform;
    private componentContext: IComponentContext;

    // tslint:disable:variable-name allowing _ for params exposed with getter
    constructor(
        public readonly tenantId: string,
        public readonly id: string,
        public readonly platform: IPlatform,
        public readonly parentBranch: string,
        public readonly existing: boolean,
        public readonly options: any,
        private _clientId: string,
        public readonly user: IUser,
        public readonly blobManager: BlobManager,
        public readonly chaincode: IChaincodeHost,
        public readonly deltaManager: DeltaManager,
        public readonly quorum: IQuorum,
        public readonly storage: IDocumentStorageService,
        private _connectionState: ConnectionState,
        public readonly baseSnapshot: ISnapshotTree,
        public readonly blobs: Map<string, string>,
        public readonly branch: string,
        private _minimumSequenceNumber: number,
        public readonly submitFn: (type: MessageType, contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void,
    ) {
    }
    // tslint:enable:variable-name

    public get ready(): Promise<void> {
        if (!this.componentContext) {
            return Promise.resolve();
        }

        return this.componentContext.ready;
    }

    public async snapshot(tagMessage: string): Promise<ITree> {
        if (!this.componentContext) {
            return null;
        }

        return this.componentContext.snapshot(tagMessage);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        if (!this.componentContext) {
            return;
        }

        this.componentContext.changeConnectionState(value, clientId);
    }

    public async stop(): Promise<ITree> {
        if (!this.componentContext) {
            return null;
        }

        const snapshot = await this.componentContext.snapshot("");
        await this.componentContext.stop();

        return snapshot;
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (!this.componentContext) {
            return;
        }

        return this.componentContext.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (!this.componentContext) {
            return;
        }

        this.componentContext.process(message, local, context);
    }

    public async postProcess(message: ISequencedDocumentMessage, local: boolean, context: any): Promise<void> {
        if (!this.componentContext) {
            return;
        }

        return this.componentContext.postProcess(message, local, context);
    }

    public updateMinSequenceNumber(minimumSequenceNumber: number) {
        if (!this.componentContext) {
            return;
        }

        this.componentContext.updateMinSequenceNumber(minimumSequenceNumber);
    }

    public error(err: any): void {
        throw new Error("Not implemented");
    }

    private async start() {
        this.contextPlatform = await this.chaincode.run(this);
        this.componentContext = await this.contextPlatform.queryInterface<IComponentContext>("context");
    }
}
