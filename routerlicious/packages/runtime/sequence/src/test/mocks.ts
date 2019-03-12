import {
    ConnectionState,
    IBlob,
    IDeltaManager,
    IDocumentMessage,
    IGenericBlob,
    ILoader,
    IPlatform,
    IQuorum,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
} from "@prague/container-definitions";
import {
    IChannel,
    IDeltaConnection,
    IDeltaHandler,
    IDistributedObjectServices,
    IObjectStorageService,
    IRuntime,
} from "@prague/runtime-definitions";
import * as assert from "assert";

// An implementtion of IObjectStorageService based on ITree input.
export class MockStorage implements IObjectStorageService {
    public static readCore(tree: ITree, paths: string[]): string {
        for (const entry of tree.entries) {
            if (entry.path === paths[0]) {
                if (entry.type === "Blob") {
                    assert (paths.length === 1);
                    const blob = entry.value as IBlob;
                    return Buffer.from(blob.contents, blob.encoding).toString("base64");
                }
                if (entry.type === "Tree") {
                    return MockStorage.readCore(entry.value as ITree, paths.slice(1));
                }
                assert(false);
                return null;
            }
        }
        assert(false);
        return null;
    }

    constructor(protected tree: ITree) {
    }

    public async read(path: string): Promise<string> {
        return MockStorage.readCore(this.tree, path.split("/"));
    }
}

// Mock implementaiton IDeltaConnection that does nothing
export class MockDeltaConnection implements IDeltaConnection {
    public state: ConnectionState = ConnectionState.Connecting;
    public submit(messageContent: any): number {
        return 1;
    }
    public attach(handler: IDeltaHandler): void {
        return;
    }
}

// Mock implementaiton of IRuntime
export class MockRuntime implements IRuntime {
    public readonly tenantId: string;
    public readonly documentId: string;
    public readonly id: string;
    public readonly existing: boolean;
    public readonly options: any;
    public readonly clientId: string = "1";
    public readonly parentBranch: string;
    public readonly connected: boolean;
    public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    public readonly platform: IPlatform;
    public readonly loader: ILoader;

    public async getChannel(id: string): Promise<IChannel> {
        return null;
    }
    public createChannel(id: string, type: string): IChannel {
        return null;
    }
    public attachChannel(channel: IChannel): IDistributedObjectServices {
        return null;
    }
    public getQuorum(): IQuorum {
        return null;
    }
    public async snapshot(message: string): Promise<void> {
        return null;
    }
    public save(message: string) {
        return;
    }
    public close(): void {
        return null;
    }
    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        return null;
    }
    public async getBlob(sha: string): Promise<IGenericBlob> {
        return null;
    }
    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return null;
    }
    public submitMessage(type: MessageType, content: any) {
        return null;
    }

    public addListener(event: string | symbol, listener: (...args: any[]) => void): this {
        return null;
    }
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return null;
    }
    public once(event: string | symbol, listener: (...args: any[]) => void): this {
        return null;
    }
    public prependListener(event: string | symbol, listener: (...args: any[]) => void): this {
        return null;
    }
    public prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this {
        return null;
    }
    public removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
        return null;
    }
    public off(event: string | symbol, listener: (...args: any[]) => void): this {
        return null;
    }
    public removeAllListeners(event?: string | symbol): this {
        return null;
    }
    public setMaxListeners(n: number): this {
        return null;
    }
    public getMaxListeners(): number {
        return null;
    }

    // tslint:disable-next-line:ban-types
    public listeners(event: string | symbol): Function[] {
        return null;
    }
    // tslint:disable-next-line:ban-types
    public rawListeners(event: string | symbol): Function[] {
        return null;
    }
    public emit(event: string | symbol, ...args: any[]): boolean {
        return null;
    }
    public eventNames(): Array<string | symbol> {
        return null;
    }
    public listenerCount(type: string | symbol): number {
        return null;
    }
}
