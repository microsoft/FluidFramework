/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryLogger, IDisposable } from "@microsoft/fluid-common-definitions";
import {
    IComponent,
    IComponentConfiguration,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IDocumentStorageService, IError } from "@microsoft/fluid-driver-definitions";
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
} from "@microsoft/fluid-protocol-definitions";
import { IAudience } from "./audience";
import { IBlobManager } from "./blobs";
import { IDeltaManager } from "./deltas";
import { ICodeLoader, ILoader } from "./loader";

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
    changeConnectionState(value: ConnectionState, clientId?: string);

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
}

export interface IExperimentalRuntime extends IRuntime {

    isExperimentalRuntime: true;

    createSummary(): ISummaryTree;
}

export interface IMessageScheduler {
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
}

export const IMessageScheduler: keyof IProvideMessageScheduler = "IMessageScheduler";

export interface IProvideMessageScheduler {
    readonly IMessageScheduler: IMessageScheduler;
}

export interface IContainerContext extends EventEmitter, IMessageScheduler, IProvideMessageScheduler, IDisposable {
    readonly id: string;
    readonly existing: boolean | undefined;
    readonly options: any;
    readonly configuration: IComponentConfiguration;
    readonly clientId: string | undefined;
    readonly clientDetails: IClientDetails;
    readonly parentBranch: string | null;
    readonly blobManager: IBlobManager | undefined;
    readonly storage: IDocumentStorageService | undefined | null;
    readonly connectionState: ConnectionState;
    readonly connected: boolean;
    readonly branch: string;
    readonly baseSnapshot: ISnapshotTree | null;
    readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;
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

    error(err: IError): void;
    requestSnapshot(tagMessage: string): Promise<void>;
    reloadContext(): Promise<void>;

    /**
     * DEPRECATED
     * back-compat: 0.14 uploadSummary
     */
    refreshBaseSummary(snapshot: ISnapshotTree): void;
}

export interface IExperimentalContainerContext extends IContainerContext {
    isExperimentalContainerContext: true;

    isLocal(): boolean;

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

declare module "@microsoft/fluid-component-core-interfaces" {
    /* eslint-disable @typescript-eslint/indent, @typescript-eslint/no-empty-interface */
    export interface IComponent extends Readonly<Partial<
        IProvideRuntimeFactory &
        IProvideComponentTokenProvider &
        IProvideMessageScheduler>> { }
}
    /* eslint-enable @typescript-eslint/indent, @typescript-eslint/no-empty-interface */
