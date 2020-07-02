/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, IDisposable } from "@fluidframework/common-definitions";
import {
    IComponent,
    IComponentConfiguration,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    ConnectionState,
    IClientDetails,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISnapshotTree,
    ITree,
    MessageType,
    ISummaryTree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { IAudience } from "./audience";
import { IBlobManager } from "./blobs";
import { IDeltaManager } from "./deltas";
import { CriticalContainerError, ContainerWarning } from "./error";
import { ICodeLoader, ILoader } from "./loader";

// Issue #2375
// TODO: remove, replace all usage with version from protocol-definitions
export const summarizerClientType = "summarizer";

// Represents the attachment state of the entity.
export enum AttachState {
    Detached = "Detached",
    Attaching = "Attaching",
    Attached = "Attached",
}

// Represents the bind state of the entity.
export enum BindState {
    NotBound = "NotBound",
    Binding = "Binding",
    Bound = "Bound",
}

/**
 * Person definition in a npm script
 */
export interface IPerson {
    name: string;
    email: string;
    url: string;
}

/**
 * Typescript interface definition for fields within a npm module's package.json.
 */
export interface IPackage {
    // General access for extended fields
    [key: string]: any;
    name: string;
    version: string;
    description?: string;
    keywords?: string[];
    homepage?: string;
    bugs?: { url: string; email: string };
    license?: string;
    author?: IPerson;
    contributors?: IPerson[];
    files?: string[];
    main?: string;
    // Same as main but for browser based clients (check if webpack supports this)
    browser?: string;
    bin?: { [key: string]: string };
    man?: string | string[];
    repository?: string | { type: string; url: string };
    scripts?: { [key: string]: string };
    config?: { [key: string]: string };
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
    peerDependencies?: { [key: string]: string };
    bundledDependencies?: { [key: string]: string };
    optionalDependencies?: { [key: string]: string };
    engines?: { node: string; npm: string };
    os?: string[];
    cpu?: string[];
    private?: boolean;
}

export interface IFluidPackage extends IPackage {
    // https://stackoverflow.com/questions/10065564/add-custom-metadata-or-config-to-package-json-is-it-valid
    fluid: {
        browser: {
            [libraryTarget: string]: {
                // List of bundled JS files. Absolute URLs will be loaded directly. Relative paths will be specific
                // to the CDN location
                files: string[];

                // If libraryTarget is umd then library is the global name that the script entry points will be exposed
                // under. Other target formats may choose to reinterpret this value.
                library: string;
            };
        };
    };
}

/**
 * Check if the package.json defines a fluid module, which requires a `fluid` entry
 * @param pkg - the package json data to check if it is a fluid package.
 */
export const isFluidPackage = (pkg: IPackage): pkg is IFluidPackage =>
    pkg.fluid?.browser?.umd !== undefined;

/**
 * Package manager configuration. Provides a key value mapping of config values
 */
export interface IPackageConfig {
    [key: string]: string;
}

/**
 * Data structure used to describe the code to load on the Fluid document
 */
export interface IFluidCodeDetails {
    /**
     * The code package to be used on the Fluid document. This is either the package name which will be loaded
     * from a package manager. Or the expanded fluid package.
     */
    package: string | IFluidPackage;

    /**
     * Configuration details. This includes links to the package manager and base CDNs.
     */
    config: IPackageConfig;
}

export interface IRuntimeState {
    snapshot?: ITree,
    state?: unknown,
}

/**
 * The IRuntime represents an instantiation of a code package within a container.
 */
export interface IRuntime extends IDisposable {

    /**
     * Executes a request against the runtime
     */
    request(request: IRequest): Promise<IResponse>;

    /**
     * Snapshots the runtime
     */
    snapshot(tagMessage: string, fullTree?: boolean): Promise<ITree | null>;

    /**
     * Notifies the runtime of a change in the connection state
     */
    setConnectionState(connected: boolean, clientId?: string);

    // Back-compat: supporting <= 0.16 components
    changeConnectionState?: (value: ConnectionState, clientId?: string) => void;

    /**
     * @deprecated in 0.14 async stop()
     * Use snapshot to get a snapshot for an IRuntimeState as needed, followed by dispose
     *
     * Stops the runtime. Once stopped no more messages will be delivered and the context passed to the runtime
     * on creation will no longer be active
     */
    stop(): Promise<IRuntimeState>;

    /**
     * Processes the given message
     */
    process(message: ISequencedDocumentMessage, local: boolean, context: any);

    /**
     * Processes the given signal
     */
    processSignal(message: any, local: boolean);

    createSummary(): ISummaryTree;
}

export interface IMessageScheduler {
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
}

export const IMessageScheduler: keyof IProvideMessageScheduler = "IMessageScheduler";

export interface IProvideMessageScheduler {
    readonly IMessageScheduler: IMessageScheduler;
}

export interface IContainerContext extends IMessageScheduler, IProvideMessageScheduler, IDisposable {
    readonly id: string;
    readonly existing: boolean | undefined;
    readonly options: any;
    readonly configuration: IComponentConfiguration;
    readonly clientId: string | undefined;
    readonly clientDetails: IClientDetails;
    readonly parentBranch: string | null;
    readonly blobManager: IBlobManager | undefined;
    readonly storage: IDocumentStorageService | undefined | null;
    readonly connected: boolean;
    readonly branch: string;
    readonly baseSnapshot: ISnapshotTree | null;
    readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: (error?: CriticalContainerError) => void;
    readonly quorum: IQuorum;
    readonly audience: IAudience | undefined;
    readonly loader: ILoader;
    readonly codeLoader: ICodeLoader;
    readonly logger: ITelemetryLogger;
    readonly serviceConfiguration: IServiceConfiguration | undefined;
    readonly version: string;
    readonly previousRuntimeState: IRuntimeState;

    /**
     * Ambient services provided with the context
     */
    readonly scope: IComponent;

    raiseContainerWarning(warning: ContainerWarning): void;
    requestSnapshot(tagMessage: string): Promise<void>;
    reloadContext(): Promise<void>;

    /**
     * Get an absolute url for a provided container-relative request.
     * @param relativeUrl - A relative request within the container
     *
     * TODO: Optional for backwards compatibility. Make non-optional in version 0.19
     */
    getAbsoluteUrl?(relativeUrl: string): Promise<string>;

    /**
     * Indicates the attachment state of the container to a host service.
     */
    readonly attachState: AttachState;

    getLoadedFromVersion(): IVersion | undefined;

    createSummary(): ISummaryTree;
}

export const IComponentTokenProvider: keyof IProvideComponentTokenProvider = "IComponentTokenProvider";

export interface IProvideComponentTokenProvider {
    readonly IComponentTokenProvider: IComponentTokenProvider;
}

export interface IComponentTokenProvider extends IProvideComponentTokenProvider {
    intelligence: { [service: string]: any };
}

export interface IFluidModule {
    fluidExport: IComponent;
}

export const IRuntimeFactory: keyof IProvideRuntimeFactory = "IRuntimeFactory";

export interface IProvideRuntimeFactory {
    readonly IRuntimeFactory: IRuntimeFactory;
}
/**
 * Exported module definition
 */
export interface IRuntimeFactory extends IProvideRuntimeFactory {
    /**
     * Instantiates a new chaincode container
     */
    instantiateRuntime(context: IContainerContext): Promise<IRuntime>;
}

declare module "@fluidframework/component-core-interfaces" {
    /* eslint-disable @typescript-eslint/no-empty-interface */
    export interface IComponent extends Readonly<Partial<
        IProvideRuntimeFactory &
        IProvideComponentTokenProvider &
        IProvideMessageScheduler>> { }
}
    /* eslint-enable @typescript-eslint/no-empty-interface */
