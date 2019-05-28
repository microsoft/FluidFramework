import { IBlobManager } from "./blobs";
import { IQuorum } from "./consensus";
import { IDeltaManager } from "./deltas";
import { ICodeLoader, ILoader, IRequest, IResponse } from "./loader";
import { TelemetryLogger } from "./logger";
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "./protocol";
import { IDocumentStorageService, ISnapshotTree, ITree } from "./storage";

/**
 * Person definition in a npm script
 */
export interface IPerson {
    name: string;
    email: string;
    url: string;
}

/**
 * Typescript interface definition for fields within a NPM module's package.json.
 */
export interface IPackage {
    name: string;
    version: string;
    description: string;
    keywords: string[];
    homepage: string;
    bugs: { url: string; email: string };
    license: string;
    author: IPerson;
    contributors: IPerson[];
    files: string[];
    main: string;
    // Same as main but for browser based clients (check if webpack supports this)
    browser: string;
    bin: { [key: string]: string };
    man: string | string[];
    repository: string | { type: string; url: string };
    scripts: { [key: string]: string };
    config: { [key: string]: string };
    dependencies: { [key: string]: string };
    devDependencies: { [key: string]: string };
    peerDependencies: { [key: string]: string };
    bundledDependencies: { [key: string]: string };
    optionalDependencies: { [key: string]: string };
    engines: { node: string; npm: string };
    os: string[];
    cpu: string[];
    private: boolean;
}

export interface IPraguePackage extends IPackage {
    // https://stackoverflow.com/questions/10065564/add-custom-metadata-or-config-to-package-json-is-it-valid
    prague: {
        browser: {
            // List of bundled JS files - both local files and ones on a CDN
            bundle: string[];

            // Global for the entrypoint to the root package
            entrypoint: string;
        };
    };
}

export enum ConnectionState {
    /**
     * The document is no longer connected to the delta server
     */
    Disconnected,

    /**
     * The document has an inbound connection but is still pending for outbound deltas
     */
    Connecting,

    /**
     * The document is fully connected
     */
    Connected,
}

/**
 * The IRuntime represents an instantiation of a code package within a container.
 */
export interface IRuntime {
    /**
     * Executes a request against the runtime
     */
    request(request: IRequest): Promise<IResponse>;

    /**
     * Snapshots the runtime
     */
    snapshot(tagMessage: string): Promise<ITree | null>;

    /**
     * Notifies the runtime of a change in the connection state
     */
    changeConnectionState(value: ConnectionState, clientId: string);

    /**
     * Stops the runtime. Once stopped no more messages will be delivered and the context passed to the runtime
     * on creation will no longer be active
     */
    stop(): Promise<void>;

    /**
     * Prepares the given message for execution
     */
    prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    /**
     * Processes the given message
     */
    process(message: ISequencedDocumentMessage, local: boolean, context: any);

    /**
     * Called immediately after a message has been processed but prior to the next message being executed
     */
    postProcess(message: ISequencedDocumentMessage, local: boolean, context: any): Promise<void>;

    /**
     * Processes the given signal
     */
    processSignal(message: any, local: boolean);
}

export interface IContainerContext {
    readonly id: string;
    readonly existing: boolean | undefined;
    readonly options: any;
    readonly clientId: string | undefined;
    readonly clientType: string;
    readonly parentBranch: string | undefined | null;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> | undefined;
    readonly blobManager: IBlobManager | undefined;
    readonly storage: IDocumentStorageService | undefined | null;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly minimumSequenceNumber: number | undefined;
    readonly baseSnapshot: ISnapshotTree | null;
    readonly blobs: Map<string, string>;
    readonly submitFn: (type: MessageType, contents: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;
    readonly quorum: IQuorum | undefined;
    readonly loader: ILoader;
    readonly codeLoader: ICodeLoader;
    readonly logger: TelemetryLogger;

    error(err: any): void;
    requestSnapshot(tagMessage: string): Promise<void>;
}

/**
 * Exported module definition
 */
export interface IChaincodeFactory {
    /**
     * Instantiates a new chaincode container
     */
    instantiateRuntime(context: IContainerContext): Promise<IRuntime>;
}
