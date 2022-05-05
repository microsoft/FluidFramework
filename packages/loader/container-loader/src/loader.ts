/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    FluidObject,
    IFluidRouter,
    IRequest,
    IRequestHeader,
    IResponse,
} from "@fluidframework/core-interfaces";
import {
    IContainer,
    IFluidModule,
    IHostLoader,
    ILoader,
    IPendingLocalState,
    ILoaderOptions as ILoaderOptions1,
    IProxyLoaderFactory,
    LoaderHeader,
    IProvideFluidCodeDetailsComparer,
    IFluidCodeDetails,
} from "@fluidframework/container-definitions";
import {
    ChildLogger,
    DebugLogger,
    IConfigProviderBase,
    loggerToMonitoringContext,
    mixinMonitoringContext,
    MonitoringContext,
    PerformanceEvent,
    sessionStorageConfigProvider,
} from "@fluidframework/telemetry-utils";
import {
    IDocumentServiceFactory,
    IDocumentStorageService,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    ensureFluidResolvedUrl,
    MultiUrlResolver,
    MultiDocumentServiceFactory,
} from "@fluidframework/driver-utils";
import { Container } from "./container";
import { IParsedUrl, parseUrl } from "./utils";
import { pkgVersion } from "./packageVersion";

function canUseCache(request: IRequest): boolean {
    if (request.headers === undefined) {
        return true;
    }

    return request.headers[LoaderHeader.cache] !== false;
}

export class RelativeLoader implements ILoader {
    constructor(
        private readonly container: Container,
        private readonly loader: ILoader | undefined,
    ) {
    }

    public get IFluidRouter(): IFluidRouter { return this; }

    public async resolve(request: IRequest): Promise<IContainer> {
        if (request.url.startsWith("/")) {
            if (canUseCache(request)) {
                return this.container;
            } else {
                const resolvedUrl = this.container.resolvedUrl;
                ensureFluidResolvedUrl(resolvedUrl);
                const container = await Container.load(
                    this.loader as Loader,
                    {
                        canReconnect: request.headers?.[LoaderHeader.reconnect],
                        clientDetailsOverride: request.headers?.[LoaderHeader.clientDetails],
                        resolvedUrl: { ...resolvedUrl },
                        version: request.headers?.[LoaderHeader.version] ?? undefined,
                        loadMode: request.headers?.[LoaderHeader.loadMode],
                    },
                );
                return container;
            }
        }

        if (this.loader === undefined) {
            throw new Error("Cannot resolve external containers");
        }
        return this.loader.resolve(request);
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url.startsWith("/")) {
            const container = await this.resolve(request);
            return container.request(request);
        }

        if (this.loader === undefined) {
            return {
                status: 404,
                value: "Cannot request external containers",
                mimeType: "plain/text",
            };
        }
        return this.loader.request(request);
    }
}

function createCachedResolver(resolver: IUrlResolver) {
    const cacheResolver = Object.create(resolver) as IUrlResolver;
    const resolveCache = new Map<string, Promise<IResolvedUrl | undefined>>();
    cacheResolver.resolve = async (request: IRequest): Promise<IResolvedUrl | undefined> => {
        if (!canUseCache(request)) {
            return resolver.resolve(request);
        }
        if (!resolveCache.has(request.url)) {
            resolveCache.set(request.url, resolver.resolve(request));
        }

        return resolveCache.get(request.url);
    };
    return cacheResolver;
}

export interface ILoaderOptions extends ILoaderOptions1{
    summarizeProtocolTree?: boolean,
}

/**
 * @deprecated IFluidModuleWithDetails interface is moved to
 * {@link @fluidframework/container-definition#IFluidModuleWithDetails}
 * to have all the code loading modules in one package. #8193
 * Encapsulates a module entry point with corresponding code details.
 */
export interface IFluidModuleWithDetails {
    /** Fluid code module that implements the runtime factory needed to instantiate the container runtime. */
    module: IFluidModule;
    /**
     * Code details associated with the module. Represents a document schema this module supports.
     * If the code loader implements the {@link @fluidframework/core-interfaces#IFluidCodeDetailsComparer} interface,
     * it'll be called to determine whether the module code details satisfy the new code proposal in the quorum.
     */
    details: IFluidCodeDetails;
}

/**
 * @deprecated ICodeDetailsLoader interface is moved to {@link @fluidframework/container-definition#ICodeDetailsLoader}
 * to have code loading modules in one package. #8193
 * Fluid code loader resolves a code module matching the document schema, i.e. code details, such as
 * a package name and package version range.
 */
export interface ICodeDetailsLoader
 extends Partial<IProvideFluidCodeDetailsComparer> {
 /**
  * Load the code module (package) that is capable to interact with the document.
  *
  * @param source - Code proposal that articulates the current schema the document is written in.
  * @returns - Code module entry point along with the code details associated with it.
  */
 load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails>;
}

/**
 * Services and properties necessary for creating a loader
 */
export interface ILoaderProps {
    /**
     * The url resolver used by the loader for resolving external urls
     * into Fluid urls such that the container specified by the
     * external url can be loaded.
     */
    readonly urlResolver: IUrlResolver;
    /**
     * The document service factory take the Fluid url provided
     * by the resolved url and constructs all the necessary services
     * for communication with the container's server.
     */
    readonly documentServiceFactory: IDocumentServiceFactory;
    /**
     * The code loader handles loading the necessary code
     * for running a container once it is loaded.
     */
    readonly codeLoader: ICodeDetailsLoader;

    /**
     * A property bag of options used by various layers
     * to control features
     */
    readonly options?: ILoaderOptions;

    /**
     * Scope is provided to all container and is a set of shared
     * services for container's to integrate with their host environment.
     */
    readonly scope?: FluidObject;

    /**
     * Proxy loader factories for loading containers via proxy in other contexts,
     * like web workers, or worker threads.
     * @deprecated Not recommended for general use and will be removed in an upcoming release.
     */
    readonly proxyLoaderFactories?: Map<string, IProxyLoaderFactory>;

    /**
     * The logger that all telemetry should be pushed to.
     */
    readonly logger?: ITelemetryBaseLogger;

    /**
     * Blobs storage for detached containers.
     */
    readonly detachedBlobStorage?: IDetachedBlobStorage;

    /**
     * The configuration provider which may be used to control features.
     */
     readonly configProvider?: IConfigProviderBase;
}

/**
 * Services and properties used by and exposed by the loader
 */
export interface ILoaderServices {
    /**
     * The url resolver used by the loader for resolving external urls
     * into Fluid urls such that the container specified by the
     * external url can be loaded.
     */
    readonly urlResolver: IUrlResolver;
    /**
     * The document service factory take the Fluid url provided
     * by the resolved url and constructs all the necessary services
     * for communication with the container's server.
     */
    readonly documentServiceFactory: IDocumentServiceFactory;
    /**
     * The code loader handles loading the necessary code
     * for running a container once it is loaded.
     */
    readonly codeLoader: ICodeDetailsLoader;

    /**
     * A property bag of options used by various layers
     * to control features
     */
    readonly options: ILoaderOptions;

    /**
     * Scope is provided to all container and is a set of shared
     * services for container's to integrate with their host environment.
     */
    readonly scope: FluidObject;

    /**
     * Proxy loader factories for loading containers via proxy in other contexts,
     * like web workers, or worker threads.
     * @deprecated Not recommended for general use and will be removed in an upcoming release.
     */
    readonly proxyLoaderFactories: Map<string, IProxyLoaderFactory>;

    /**
     * The logger downstream consumers should construct their loggers from
     */
    readonly subLogger: ITelemetryLogger;

    /**
     * Blobs storage for detached containers.
     */
    readonly detachedBlobStorage?: IDetachedBlobStorage;
}

/**
 * Subset of IDocumentStorageService which only supports createBlob() and readBlob(). This is used to support
 * blobs in detached containers.
 */
export type IDetachedBlobStorage = Pick<IDocumentStorageService, "createBlob" | "readBlob"> & {
    size: number;
    /**
     * Return an array of all blob IDs present in storage
     */
    getBlobIds(): string[];
 };

/**
 * Manages Fluid resource loading
 */
export class Loader implements IHostLoader {
    private readonly containers = new Map<string, Promise<Container>>();
    public readonly services: ILoaderServices;
    private readonly mc: MonitoringContext;

    constructor(loaderProps: ILoaderProps) {
        const scope: FluidObject<ILoader> = { ...loaderProps.scope };
        if (loaderProps.options?.provideScopeLoader !== false) {
            scope.ILoader = this;
        }
        const telemetryProps = {
            loaderId: uuid(),
            loaderVersion: pkgVersion,
        };

        const subMc = mixinMonitoringContext(
            DebugLogger.mixinDebugLogger("fluid:telemetry", loaderProps.logger, { all: telemetryProps }),
            sessionStorageConfigProvider.value,
            loaderProps.configProvider,
        );

        this.services = {
            urlResolver: createCachedResolver(MultiUrlResolver.create(loaderProps.urlResolver)),
            documentServiceFactory: MultiDocumentServiceFactory.create(loaderProps.documentServiceFactory),
            codeLoader: loaderProps.codeLoader,
            options: loaderProps.options ?? {},
            scope,
            subLogger: subMc.logger,
            proxyLoaderFactories: loaderProps.proxyLoaderFactories ?? new Map<string, IProxyLoaderFactory>(),
            detachedBlobStorage: loaderProps.detachedBlobStorage,
        };
        this.mc = loggerToMonitoringContext(
            ChildLogger.create(this.services.subLogger, "Loader"));
    }

    public get IFluidRouter(): IFluidRouter { return this; }

    public async createDetachedContainer(codeDetails: IFluidCodeDetails): Promise<IContainer> {
        const container = await Container.createDetached(
            this,
            codeDetails,
        );

        if (this.cachingEnabled) {
            container.once("attached", () => {
                ensureFluidResolvedUrl(container.resolvedUrl);
                const parsedUrl = parseUrl(container.resolvedUrl.url);
                if (parsedUrl !== undefined) {
                    this.addToContainerCache(parsedUrl.id, Promise.resolve(container));
                }
            });
        }

        return container;
    }

    public async rehydrateDetachedContainerFromSnapshot(snapshot: string): Promise<IContainer> {
        return Container.rehydrateDetachedFromSnapshot(this, snapshot);
    }

    public async resolve(request: IRequest, pendingLocalState?: string): Promise<IContainer> {
        const eventName = pendingLocalState === undefined ? "Resolve" : "ResolveWithPendingState";
        return PerformanceEvent.timedExecAsync(this.mc.logger, { eventName }, async () => {
            const resolved = await this.resolveCore(
                request,
                pendingLocalState !== undefined ? JSON.parse(pendingLocalState) : undefined,
            );
            return resolved.container;
        });
    }

    public async request(request: IRequest): Promise<IResponse> {
        return PerformanceEvent.timedExecAsync(this.mc.logger, { eventName: "Request" }, async () => {
            const resolved = await this.resolveCore(request);
            return resolved.container.request({
                ...request,
                url: `${resolved.parsed.path}${resolved.parsed.query}`,
            });
        });
    }

    private getKeyForContainerCache(request: IRequest, parsedUrl: IParsedUrl): string {
        const key = request.headers?.[LoaderHeader.version] !== undefined
            ? `${parsedUrl.id}@${request.headers[LoaderHeader.version]}`
            : parsedUrl.id;
        return key;
    }

    private addToContainerCache(key: string, containerP: Promise<Container>) {
        this.containers.set(key, containerP);
        containerP.then((container) => {
            // If the container is closed or becomes closed after we resolve it, remove it from the cache.
            if (container.closed) {
                this.containers.delete(key);
            } else {
                container.once("closed", () => {
                    this.containers.delete(key);
                });
            }
        }).catch((error) => {});
    }

    private async resolveCore(
        request: IRequest,
        pendingLocalState?: IPendingLocalState,
    ): Promise<{ container: Container; parsed: IParsedUrl }> {
        const resolvedAsFluid = await this.services.urlResolver.resolve(request);
        ensureFluidResolvedUrl(resolvedAsFluid);

        // Parse URL into data stores
        const parsed = parseUrl(resolvedAsFluid.url);
        if (parsed === undefined) {
            throw new Error(`Invalid URL ${resolvedAsFluid.url}`);
        }

        if (pendingLocalState !== undefined) {
            const parsedPendingUrl = parseUrl(pendingLocalState.url);
            if (parsedPendingUrl?.id !== parsed.id ||
                parsedPendingUrl?.path.replace(/\/$/, "") !== parsed.path.replace(/\/$/, "")) {
                const message = `URL ${resolvedAsFluid.url} does not match pending state URL ${pendingLocalState.url}`;
                throw new Error(message);
            }
        }

        const { canCache, fromSequenceNumber } = this.parseHeader(parsed, request);
        const shouldCache = pendingLocalState !== undefined ? false : canCache;

        let container: Container;
        if (shouldCache) {
            const key = this.getKeyForContainerCache(request, parsed);
            const maybeContainer = await this.containers.get(key);
            if (maybeContainer !== undefined) {
                container = maybeContainer;
            } else {
                const containerP =
                    this.loadContainer(
                        request,
                        resolvedAsFluid);
                this.addToContainerCache(key, containerP);
                container = await containerP;
            }
        } else {
            container =
                await this.loadContainer(
                    request,
                    resolvedAsFluid,
                    pendingLocalState?.pendingRuntimeState);
        }

        if (container.deltaManager.lastSequenceNumber <= fromSequenceNumber) {
            await new Promise<void>((resolve, reject) => {
                function opHandler(message: ISequencedDocumentMessage) {
                    if (message.sequenceNumber > fromSequenceNumber) {
                        resolve();
                        container.removeListener("op", opHandler);
                    }
                }

                container.on("op", opHandler);
            });
        }

        return { container, parsed };
    }

    private get cachingEnabled() {
        return this.services.options.cache !== false;
    }

    private canCacheForRequest(headers: IRequestHeader): boolean {
        return this.cachingEnabled && headers[LoaderHeader.cache] !== false;
    }

    private parseHeader(parsed: IParsedUrl, request: IRequest) {
        let fromSequenceNumber = -1;

        request.headers = request.headers ?? {};

        const headerSeqNum = request.headers[LoaderHeader.sequenceNumber];
        if (headerSeqNum !== undefined) {
            fromSequenceNumber = headerSeqNum;
        }

        // If set in both query string and headers, use query string
        request.headers[LoaderHeader.version] = parsed.version ?? request.headers[LoaderHeader.version];

        const canCache = this.canCacheForRequest(request.headers);

        return {
            canCache,
            fromSequenceNumber,
        };
    }

    private async loadContainer(
        request: IRequest,
        resolved: IFluidResolvedUrl,
        pendingLocalState?: unknown,
    ): Promise<Container> {
        return Container.load(
            this,
            {
                canReconnect: request.headers?.[LoaderHeader.reconnect],
                clientDetailsOverride: request.headers?.[LoaderHeader.clientDetails],
                resolvedUrl: resolved,
                version: request.headers?.[LoaderHeader.version] ?? undefined,
                loadMode: request.headers?.[LoaderHeader.loadMode],
            },
            pendingLocalState,
        );
    }
}
