/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryBaseLogger } from "@microsoft/fluid-common-definitions";
import {
    IComponent,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    ICodeLoader,
    ILoader,
    IProxyLoaderFactory,
    LoaderHeader,
    IFluidCodeDetails,
    IExperimentalLoader,
} from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-common-utils";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-driver-definitions";
import {
    configurableUrlResolver,
    DocumentServiceFactoryProtocolMatcher,
} from "@microsoft/fluid-driver-utils";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { Container } from "./container";
import { debug } from "./debug";
import { IParsedUrl, parseUrl } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const now = require("performance-now") as () => number;

export class RelativeLoader extends EventEmitter implements ILoader {

    // Because the loader is passed to the container during construction we need to resolve the target container
    // after construction.
    private readonly containerDeferred = new Deferred<Container>();

    /**
     * BaseRequest is the original request that triggered the load. This URL is used in case credentials need
     * to be fetched again.
     */
    constructor(
        private readonly loader: Loader,
        private readonly baseRequest: IRequest | undefined,
    ) {
        super();
    }

    public async resolve(request: IRequest): Promise<Container> {
        if (request.url.startsWith("/")) {
            // If no headers are set that require a reload make use of the same object
            const container = await this.containerDeferred.promise;
            return container;
        }

        return this.loader.resolve(request);
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url.startsWith("/")) {
            if (this.needExecutionContext(request)) {
                if (!this.baseRequest) {
                    throw new Error("Base Request is not provided");
                }
                return this.loader.requestWorker(this.baseRequest.url, request);
            } else {
                let container: Container;
                if (this.canUseCache(request)) {
                    container = await this.containerDeferred.promise;
                } else if (!this.baseRequest) {
                    throw new Error("Base Request is not provided");
                } else {
                    container = await this.loader.resolve({ url: this.baseRequest.url, headers: request.headers });
                }
                return container.request(request);
            }
        }

        return this.loader.request(request);
    }

    public resolveContainer(container: Container) {
        this.containerDeferred.resolve(container);
    }

    private canUseCache(request: IRequest): boolean {
        if (!request.headers) {
            return true;
        }

        const noCache =
            request.headers[LoaderHeader.cache] === false ||
            request.headers[LoaderHeader.reconnect] === false;

        return !noCache;
    }

    private needExecutionContext(request: IRequest): boolean {
        return (request.headers !== undefined && request.headers[LoaderHeader.executionContext] !== undefined);
    }
}

/**
 * Manages Fluid resource loading
 */
export class Loader extends EventEmitter implements ILoader, IExperimentalLoader {

    private readonly containers = new Map<string, Promise<Container>>();
    private readonly resolveCache = new Map<string, IResolvedUrl>();
    private readonly protocolToDocumentFactoryMap: DocumentServiceFactoryProtocolMatcher;

    public readonly isExperimentalLoader = true;

    constructor(
        private readonly resolver: IUrlResolver | IUrlResolver[],
        documentServiceFactories: IDocumentServiceFactory | IDocumentServiceFactory[],
        private readonly codeLoader: ICodeLoader,
        private readonly options: any,
        private readonly scope: IComponent,
        private readonly proxyLoaderFactories: Map<string, IProxyLoaderFactory>,
        private readonly logger?: ITelemetryBaseLogger,
    ) {
        super();

        if (!resolver) {
            throw new Error("An IUrlResolver must be provided");
        }

        if (!documentServiceFactories) {
            throw new Error("An IDocumentService must be provided");
        }

        if (!codeLoader) {
            throw new Error("An ICodeLoader must be provided");
        }

        this.protocolToDocumentFactoryMap = new DocumentServiceFactoryProtocolMatcher(documentServiceFactories);
    }

    public async createDetachedContainer(source: IFluidCodeDetails): Promise<Container> {
        debug(`Container creating in detached state: ${now()} `);

        return Container.create(
            this.codeLoader,
            this.options,
            this.scope,
            this,
            source,
            (resolvedUrl: IFluidResolvedUrl) => {
                return this.protocolToDocumentFactoryMap.getFactory(resolvedUrl);
            },
            this.logger);
    }

    public async resolve(request: IRequest): Promise<Container> {
        debug(`Container resolve: ${now()} `);

        const resolved = await this.resolveCore(request);
        return resolved.container;
    }

    public async request(request: IRequest): Promise<IResponse> {
        debug(`Container loading: ${now()} `);

        const resolved = await this.resolveCore(request);
        return resolved.container.request({ url: resolved.parsed.path });
    }

    public async requestWorker(baseUrl: string, request: IRequest): Promise<IResponse> {

        // Currently the loader only supports web worker environment. Eventually we will
        // detect environment and bring appropiate loader (e.g., worker_thread for node).
        const supportedEnvironment = "webworker";
        const proxyLoaderFactory = this.proxyLoaderFactories.get(supportedEnvironment);

        // If the loader does not support any other environment, request falls back to current loader.
        if (!proxyLoaderFactory) {
            const container = await this.resolve({ url: baseUrl, headers: request.headers });
            return container.request(request);
        } else {
            const resolved = await this.getResolvedUrl({ url: baseUrl, headers: request.headers });
            const resolvedAsFluid = resolved as IFluidResolvedUrl;
            const parsed = parseUrl(resolvedAsFluid.url);
            if (!parsed) {
                return Promise.reject(`Invalid URL ${resolvedAsFluid.url}`);
            }
            const { fromSequenceNumber } =
                this.parseHeader(parsed, { url: baseUrl, headers: request.headers });
            const proxyLoader = await proxyLoaderFactory.createProxyLoader(
                parsed.id,
                this.options,
                resolvedAsFluid,
                fromSequenceNumber,
            );
            return proxyLoader.request(request);
        }
    }

    private async getResolvedUrl(request: IRequest): Promise<IResolvedUrl> {
        // Resolve the given request to a URL
        // Check for an already resolved URL otherwise make a new request
        const maybeResolvedUrl = this.resolveCache.get(request.url);
        if (maybeResolvedUrl) {
            return maybeResolvedUrl;
        }

        let toCache: IResolvedUrl | undefined;
        if (Array.isArray(this.resolver)) {
            toCache = await configurableUrlResolver(this.resolver, request);
        } else {
            toCache = await this.resolver.resolve(request);
        }
        if (!toCache) {
            return Promise.reject(`Invalid URL ${request.url}`);
        }
        if (toCache.type !== "fluid") {
            return Promise.reject("Only Fluid components currently supported");
        }
        this.resolveCache.set(request.url, toCache);

        return toCache;
    }

    private async resolveCore(
        request: IRequest,
    ): Promise<{ container: Container; parsed: IParsedUrl }> {

        const resolvedAsFluid = await this.getResolvedUrl(request);
        if (resolvedAsFluid.type !== "fluid") {
            throw new Error(`Cannot resolve non fluid container request: ${JSON.stringify(resolvedAsFluid)}`);
        }

        // Parse URL into components
        const parsed = parseUrl(resolvedAsFluid.url);
        if (!parsed) {
            return Promise.reject(`Invalid URL ${resolvedAsFluid.url}`);
        }

        request.headers = request.headers ? request.headers : {};
        const { canCache, fromSequenceNumber } = this.parseHeader(parsed, request);

        debug(`${canCache} ${request.headers[LoaderHeader.pause]} ${request.headers[LoaderHeader.version]}`);
        const factory: IDocumentServiceFactory =
            this.protocolToDocumentFactoryMap.getFactory(resolvedAsFluid);

        let container: Container;
        if (canCache) {
            const versionedId = request.headers[LoaderHeader.version]
                ? `${parsed.id}@${request.headers[LoaderHeader.version]}`
                : parsed.id;
            const maybeContainer = await this.containers.get(versionedId);
            if (maybeContainer) {
                container = maybeContainer;
            } else {
                const containerP =
                    this.loadContainer(
                        parsed.id,
                        await factory.createDocumentService(resolvedAsFluid),
                        request,
                        resolvedAsFluid,
                        this.logger);
                this.containers.set(versionedId, containerP);
                container = await containerP;
            }
        } else {
            container =
                await this.loadContainer(
                    parsed.id,
                    await factory.createDocumentService(resolvedAsFluid),
                    request,
                    resolvedAsFluid,
                    this.logger);
        }

        if (container.deltaManager.referenceSequenceNumber <= fromSequenceNumber) {
            await new Promise((resolve, reject) => {
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

    private canUseCache(request: IRequest): boolean {
        if (!request.headers) {
            return true;
        }

        const noCache =
            request.headers[LoaderHeader.cache] === false ||
            request.headers[LoaderHeader.reconnect] === false ||
            request.headers[LoaderHeader.pause];

        return !noCache;
    }

    private parseHeader(parsed: IParsedUrl, request: IRequest) {
        let fromSequenceNumber = -1;

        request.headers = request.headers ? request.headers : {};

        const headerSeqNum = request.headers[LoaderHeader.sequenceNumber];
        if (headerSeqNum) {
            fromSequenceNumber = headerSeqNum;
        }

        // If set in both query string and headers, use query string
        request.headers[LoaderHeader.version] = parsed.version || request.headers[LoaderHeader.version];

        // Version === null means not use any snapshot.
        if (request.headers[LoaderHeader.version] === "null") {
            request.headers[LoaderHeader.version] = null;
        }
        return {
            canCache: this.canUseCache(request),
            fromSequenceNumber,
        };
    }

    private async loadContainer(
        id: string,
        documentService: IDocumentService,
        request: IRequest,
        resolved: IFluidResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<Container> {
        const container = Container.load(
            id,
            documentService,
            this.codeLoader,
            this.options,
            this.scope,
            this,
            request,
            resolved,
            logger);

        return container;
    }
}
