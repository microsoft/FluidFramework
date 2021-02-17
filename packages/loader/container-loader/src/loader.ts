/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IFluidObject,
    IRequest,
    IRequestHeader,
    IResponse,
    IFluidRouter,
    IFluidCodeDetails,
} from "@fluidframework/core-interfaces";
import {
    ICodeLoader,
    IContainer,
    ILoader,
    ILoaderOptions,
    IProxyLoaderFactory,
    LoaderHeader,
} from "@fluidframework/container-definitions";
import { Deferred, performance } from "@fluidframework/common-utils";
import { ChildLogger, DebugLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IDocumentServiceFactory,
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
import { debug } from "./debug";
import { IParsedUrl, parseUrl } from "./utils";

function canUseCache(request: IRequest): boolean {
    if (request.headers === undefined) {
        return true;
    }

    return request.headers[LoaderHeader.cache] !== false;
}

export class RelativeLoader extends EventEmitter implements ILoader {
    // Because the loader is passed to the container during construction we need to resolve the target container
    // after construction.
    private readonly containerDeferred = new Deferred<Container>();

    /**
     * BaseRequest is the original request that triggered the load. This URL is used in case credentials need
     * to be fetched again.
     */
    constructor(
        private readonly loader: ILoader,
        private readonly containerUrl: () => string | undefined,
    ) {
        super();
    }

    public get IFluidRouter(): IFluidRouter { return this; }

    public async resolve(request: IRequest): Promise<IContainer> {
        if (request.url.startsWith("/")) {
            // If no headers are set that require a reload make use of the same object
            const container = await this.containerDeferred.promise;
            return container;
        }

        return this.loader.resolve(request);
    }

    public async request(request: IRequest): Promise<IResponse> {
        const containerUrl = this.containerUrl();
        if (request.url.startsWith("/")) {
            if (this.needExecutionContext(request)) {
                if (containerUrl === undefined) {
                    throw new Error("Container url is not provided");
                }
                return (this.loader as Loader).requestWorker(containerUrl, request);
            } else {
                let container: IContainer;
                if (canUseCache(request)) {
                    container = await this.containerDeferred.promise;
                } else if (containerUrl === undefined) {
                    throw new Error("Container url is not provided");
                } else {
                    container = await this.loader.resolve({ url: containerUrl, headers: request.headers });
                }
                return container.request(request);
            }
        }

        return this.loader.request(request);
    }

    public async createDetachedContainer(source: IFluidCodeDetails): Promise<Container> {
        throw new Error("Relative loader should not create a detached container");
    }

    public async rehydrateDetachedContainerFromSnapshot(source: string): Promise<Container> {
        throw new Error("Relative loader should not create a detached container from snapshot");
    }

    public resolveContainer(container: Container) {
        this.containerDeferred.resolve(container);
    }

    private needExecutionContext(request: IRequest): boolean {
        return (request.headers !== undefined && request.headers[LoaderHeader.executionContext] !== undefined);
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
     * by the resolved url and constucts all the necessary services
     * for communication with the container's server.
     */
    readonly documentServiceFactory: IDocumentServiceFactory;
    /**
     * The code loader handles loading the necessary code
     * for running a container once it is loaded.
     */
    readonly codeLoader: ICodeLoader;

    /**
     * A property bag of options used by various layers
     * to control features
     */
    readonly options?: ILoaderOptions;

    /**
     * Scope is provided to all container and is a set of shared
     * services for container's to integrate with their host environment.
     */
    readonly scope?: IFluidObject;

    /**
     * Proxy loader factories for loading containers via proxy in other contexts,
     * like web workers, or worker threads.
     */
    readonly proxyLoaderFactories?: Map<string, IProxyLoaderFactory>;

    /**
     * The logger that all telemetry should be pushed to.
     */
    readonly logger?: ITelemetryBaseLogger;
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
     * by the resolved url and constucts all the necessary services
     * for communication with the container's server.
     */
    readonly documentServiceFactory: IDocumentServiceFactory;
    /**
     * The code loader handles loading the necessary code
     * for running a container once it is loaded.
     */
    readonly codeLoader: ICodeLoader;

    /**
     * A property bag of options used by various layers
     * to control features
     */
    readonly options: ILoaderOptions;

    /**
     * Scope is provided to all container and is a set of shared
     * services for container's to integrate with their host environment.
     */
    readonly scope: IFluidObject;

    /**
     * Proxy loader factories for loading containers via proxy in other contexts,
     * like web workers, or worker threads.
     */
    readonly proxyLoaderFactories: Map<string, IProxyLoaderFactory>;

    /**
     * The logger downstream consumers should construct their loggers from
     */
    readonly subLogger: ITelemetryLogger;
}

/**
 * Manages Fluid resource loading
 */
export class Loader extends EventEmitter implements ILoader {
    private readonly containers = new Map<string, Promise<Container>>();
    public readonly services: ILoaderServices;
    private readonly logger: ITelemetryLogger;

    /**
     * @deprecated use constructor with loader props
     */
    public static _create(
        resolver: IUrlResolver | IUrlResolver[],
        documentServiceFactory: IDocumentServiceFactory | IDocumentServiceFactory[],
        codeLoader: ICodeLoader,
        options: ILoaderOptions,
        scope: IFluidObject,
        proxyLoaderFactories: Map<string, IProxyLoaderFactory>,
        logger?: ITelemetryBaseLogger,
    ) {
        return new Loader(
            {
                urlResolver: MultiUrlResolver.create(resolver),
                documentServiceFactory: MultiDocumentServiceFactory.create(documentServiceFactory),
                codeLoader,
                options,
                scope,
                proxyLoaderFactories,
                logger,
            });
    }

    constructor(loaderProps: ILoaderProps) {
        super();
        this.services = {
            urlResolver: createCachedResolver(MultiUrlResolver.create(loaderProps.urlResolver)),
            documentServiceFactory: MultiDocumentServiceFactory.create(loaderProps.documentServiceFactory),
            codeLoader: loaderProps.codeLoader,
            options: loaderProps.options ?? {},
            scope: loaderProps.scope ?? {},
            subLogger: DebugLogger.mixinDebugLogger("fluid:telemetry", loaderProps.logger, { loaderId: uuid() }),
            proxyLoaderFactories: loaderProps.proxyLoaderFactories ?? new Map<string, IProxyLoaderFactory>(),
        };
        this.logger = ChildLogger.create(this.services.subLogger, "Loader");
    }

    public get IFluidRouter(): IFluidRouter { return this; }

    public async createDetachedContainer(codeDetails: IFluidCodeDetails): Promise<Container> {
        debug(`Container creating in detached state: ${performance.now()} `);

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

    public async rehydrateDetachedContainerFromSnapshot(snapshot: string): Promise<Container> {
        debug(`Container creating in detached state: ${performance.now()} `);

        return Container.rehydrateDetachedFromSnapshot(
            this,
            JSON.parse(snapshot));
    }

    public async resolve(request: IRequest): Promise<Container> {
        return PerformanceEvent.timedExecAsync(this.logger, { eventName: "Resolve" }, async () => {
            const resolved = await this.resolveCore(request);
            return resolved.container;
        });
    }

    public async request(request: IRequest): Promise<IResponse> {
        return PerformanceEvent.timedExecAsync(this.logger, { eventName: "Request" }, async () => {
            const resolved = await this.resolveCore(request);
            return resolved.container.request({ url: resolved.parsed.path });
        });
    }

    public async requestWorker(containerUrl: string, request: IRequest): Promise<IResponse> {
        // Currently the loader only supports web worker environment. Eventually we will
        // detect environment and bring appropriate loader (e.g., worker_thread for node).
        const supportedEnvironment = "webworker";
        const proxyLoaderFactory = this.services.proxyLoaderFactories.get(supportedEnvironment);

        // If the loader does not support any other environment, request falls back to current loader.
        if (proxyLoaderFactory === undefined) {
            const container = await this.resolve({ url: containerUrl, headers: request.headers });
            return container.request(request);
        } else {
            const resolved = await this.services.urlResolver.resolve({ url: containerUrl, headers: request.headers });
            const resolvedAsFluid = resolved as IFluidResolvedUrl;
            const parsed = parseUrl(resolvedAsFluid.url);
            if (parsed === undefined) {
                return Promise.reject(new Error(`Invalid URL ${resolvedAsFluid.url}`));
            }
            const { fromSequenceNumber } =
                this.parseHeader(parsed, { url: containerUrl, headers: request.headers });
            const proxyLoader = await proxyLoaderFactory.createProxyLoader(
                parsed.id,
                this.services.options,
                resolvedAsFluid,
                fromSequenceNumber,
            );
            return proxyLoader.request(request);
        }
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
        }).catch((error) => { console.log("Error during caching Container on the Loader", error); });
    }

    private async resolveCore(
        request: IRequest,
    ): Promise<{ container: Container; parsed: IParsedUrl }> {
        const resolvedAsFluid = await this.services.urlResolver.resolve(request);
        ensureFluidResolvedUrl(resolvedAsFluid);

        // Parse URL into data stores
        const parsed = parseUrl(resolvedAsFluid.url);
        if (parsed === undefined) {
            return Promise.reject(new Error(`Invalid URL ${resolvedAsFluid.url}`));
        }

        // parseUrl's id is expected to be of format "tenantId/docId"
        const [, docId] = parsed.id.split("/");
        const { canCache, fromSequenceNumber } = this.parseHeader(parsed, request);

        let container: Container;
        if (canCache) {
            const key = this.getKeyForContainerCache(request, parsed);
            const maybeContainer = await this.containers.get(key);
            if (maybeContainer !== undefined) {
                container = maybeContainer;
            } else {
                const containerP =
                    this.loadContainer(
                        docId,
                        request,
                        resolvedAsFluid);
                this.addToContainerCache(key, containerP);
                container = await containerP;
            }
        } else {
            container =
                await this.loadContainer(
                    docId,
                    request,
                    resolvedAsFluid);
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

        // Version === null means not use any snapshot.
        if (request.headers[LoaderHeader.version] === "null") {
            request.headers[LoaderHeader.version] = null;
        }

        const canCache = this.canCacheForRequest(request.headers);
        debug(`${canCache} ${request.headers[LoaderHeader.version]}`);

        return {
            canCache,
            fromSequenceNumber,
        };
    }

    private async loadContainer(
        docId: string,
        request: IRequest,
        resolved: IFluidResolvedUrl,
    ): Promise<Container> {
        return Container.load(
            docId,
            this,
            request.url,
            resolved,
            {
                canReconnect: request.headers?.[LoaderHeader.reconnect],
                clientDetailsOverride: request.headers?.[LoaderHeader.clientDetails],
                version: request.headers?.[LoaderHeader.version],
                pause: request.headers?.[LoaderHeader.pause],
            },
        );
    }
}
