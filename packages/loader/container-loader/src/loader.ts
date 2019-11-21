/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    ICodeLoader,
    IHost,
    ILoader,
    IProxyLoaderFactory,
    ITelemetryBaseLogger,
} from "@microsoft/fluid-container-definitions";
import { configurableUrlResolver, Deferred } from "@microsoft/fluid-core-utils";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";
// tslint:disable-next-line:no-var-requires
const now = require("performance-now") as () => number;
import { parse } from "url";
import { Container } from "./container";
import { debug } from "./debug";

interface IParsedUrl {
    id: string;
    path: string;
    /**
     * null means do not use snapshots, undefined means load latest snapshot
     * otherwise it's version ID passed to IDocumentStorageService.getVersions() to figure out what snapshot to use.
     * If needed, can add undefined which is treated by Container.load() as load latest snapshot.
     */
    version: string | null | undefined;
}

export enum LoaderHeader {
    cache = "fluid-cache",

    /**
     * type of client; defaults to "browser"
     */
    clientType = "fluid-client-type",

    /**
     * connection options (list of keywords). Accepted options are open & pause.
     */
    connect = "connect",
    executionContext = "execution-context",
    sequenceNumber = "fluid-sequence-number",
    reconnect = "fluid-reconnect",

    /**
     * One of the following:
     * null or "null": use ops, no snapshots
     * undefined: fetch latest snapshot
     * otherwise, version sha to load snapshot
     */
    version = "version",
}
export interface ILoaderHeader {
    [LoaderHeader.cache]: boolean;
    [LoaderHeader.clientType]: string;
    [LoaderHeader.connect]: string;
    [LoaderHeader.executionContext]: string;
    [LoaderHeader.sequenceNumber]: number;
    [LoaderHeader.reconnect]: boolean;
    [LoaderHeader.version]: string | undefined | null;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IRequestHeader extends Partial<ILoaderHeader> {
    }
}

export class RelativeLoader extends EventEmitter implements ILoader {

    // Because the loader is passed to the container during construction we need to resolve the target container
    // after construction.
    private readonly containerDeferred = new Deferred<Container>();

    /**
     * baseRequest is the original request that triggered the load. This URL is used in case credentials need
     * to be fetched again.
     */
    constructor(private readonly loader: Loader, private readonly baseRequest: IRequest) {
        super();
    }

    public async resolve(request: IRequest): Promise<Container> {
        if (request.url.indexOf("/") === 0) {
            // If no headers are set that require a reload make use of the same object
            const container = await this.containerDeferred.promise;
            return container;
        }

        return this.loader.resolve(request);
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url.indexOf("/") === 0) {
            if (this.needExecutionContext(request)) {
                return this.loader.requestWorker(this.baseRequest.url, request);
            } else {
                const container = this.canUseCache(request)
                ? await this.containerDeferred.promise
                : await this.loader.resolve({ url: this.baseRequest.url, headers: request.headers });
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
 * Api that selects a document service factory from the factory map provided according to protocol
 * in resolved URL.
 * @param resolvedAsFluid - Resolved fluid URL containing driver protocol
 * @param protocolToDocumentFactoryMap - Map of protocol name to factories from which one factory
 * is selected according to protocol.
 */
export function selectDocumentServiceFactoryForProtocol(
    resolvedAsFluid: IFluidResolvedUrl,
    protocolToDocumentFactoryMap: Map<string, IDocumentServiceFactory>,
): IDocumentServiceFactory {
    const urlObj = parse(resolvedAsFluid.url);
    if (!urlObj.protocol) {
        throw new Error("No protocol provided");
    }
    const factory: IDocumentServiceFactory | undefined = protocolToDocumentFactoryMap.get(urlObj.protocol);
    if (!factory) {
        throw new Error("Unknown fluid protocol");
    }
    return factory;
}

/**
 * Api that creates the protocol to factory map.
 * @param documentServiceFactories - A single factory or array of document factories.
 */
export function createProtocolToFactoryMapping(
    documentServiceFactories: IDocumentServiceFactory | IDocumentServiceFactory[],
): Map<string, IDocumentServiceFactory> {
    const protocolToDocumentFactoryMap: Map<string, IDocumentServiceFactory> = new Map();
    if (Array.isArray(documentServiceFactories)) {
        documentServiceFactories.forEach((factory: IDocumentServiceFactory) => {
            protocolToDocumentFactoryMap.set(factory.protocolName, factory);
        });
    } else {
        protocolToDocumentFactoryMap.set(documentServiceFactories.protocolName, documentServiceFactories);
    }
    return protocolToDocumentFactoryMap;
}

/**
 * Manages Fluid resource loading
 */
export class Loader extends EventEmitter implements ILoader {

    private readonly containers = new Map<string, Promise<Container>>();
    private readonly resolveCache = new Map<string, IResolvedUrl>();
    private readonly protocolToDocumentFactoryMap: Map<string, IDocumentServiceFactory>;

    constructor(
        private readonly containerHost: IHost,
        private readonly documentServiceFactories: IDocumentServiceFactory | IDocumentServiceFactory[],
        private readonly codeLoader: ICodeLoader,
        private readonly options: any,
        private readonly scope: IComponent,
        private readonly proxyLoaderFactories: Map<string, IProxyLoaderFactory>,
        private readonly logger?: ITelemetryBaseLogger,
    ) {
        super();

        if (!containerHost) {
            throw new Error("An IContainerHost must be provided");
        }

        if (!this.documentServiceFactories) {
            throw new Error("An IDocumentService must be provided");
        }

        if (!codeLoader) {
            throw new Error("An ICodeLoader must be provided");
        }

        this.protocolToDocumentFactoryMap = createProtocolToFactoryMapping(this.documentServiceFactories);
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
            const parsed = this.parseUrl(resolvedAsFluid.url);
            if (!parsed) {
                return Promise.reject(`Invalid URL ${resolvedAsFluid.url}`);
            }
            const { fromSequenceNumber } =
                this.parseHeader(parsed, { url: baseUrl, headers: request.headers });
            const proxyLoader = await proxyLoaderFactory.createProxyLoader(
                parsed!.id,
                this.options,
                resolvedAsFluid,
                fromSequenceNumber,
            );
            return proxyLoader.request(request);
        }
    }

    private parseUrl(url: string): IParsedUrl | null {
        const parsed = parse(url, true);

        const regex = /^\/([^\/]*\/[^\/]*)(\/?.*)$/;
        const match = parsed.pathname!.match(regex);

        return (match && match.length === 3)
            ? { id: match[1], path: match[2], version: parsed.query.version as string }
            : null;
    }

    private async getResolvedUrl(request: IRequest): Promise<IResolvedUrl> {
        // Resolve the given request to a URL
        // Check for an already resolved URL otherwise make a new request
        const maybeResolvedUrl = this.resolveCache.get(request.url);
        if (maybeResolvedUrl) {
            return maybeResolvedUrl;
        }

        let toCache: IResolvedUrl | undefined;
        if (Array.isArray(this.containerHost.resolver)) {
            toCache = await configurableUrlResolver(this.containerHost.resolver, request);
        } else {
            toCache = await this.containerHost.resolver.resolve(request);
        }
        if (!toCache) {
            return Promise.reject(`Invalid URL ${request.url}`);
        }
        if (toCache.type !== "fluid") {
            if (toCache.type === "prague") {
                // tslint:disable-next-line:max-line-length
                console.warn("IFluidResolvedUrl type === 'prague' has been deprecated. Please create IFluidResolvedUrls of type 'fluid' in the future.");
            } else {
                return Promise.reject("Only Fluid components currently supported");
            }
        }
        this.resolveCache.set(request.url, toCache);

        return toCache;
    }

    private async resolveCore(
        request: IRequest,
    ): Promise<{ container: Container, parsed: IParsedUrl }> {

        const resolved = await this.getResolvedUrl(request);

        // Parse URL into components
        const resolvedAsFluid = resolved as IFluidResolvedUrl;
        const parsed = this.parseUrl(resolvedAsFluid.url);
        if (!parsed) {
            return Promise.reject(`Invalid URL ${resolvedAsFluid.url}`);
        }

        request.headers = request.headers ? request.headers : {};
        const {canCache, fromSequenceNumber } = this.parseHeader(parsed, request);

        debug(`${canCache} ${request.headers[LoaderHeader.connect]} ${request.headers[LoaderHeader.version]}`);
        const factory: IDocumentServiceFactory =
            selectDocumentServiceFactoryForProtocol(resolvedAsFluid, this.protocolToDocumentFactoryMap);

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
                        resolved,
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
                    resolved,
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

    private parseHeader(parsed: IParsedUrl, request: IRequest) {
        let canCache = true;
        let fromSequenceNumber = -1;

        request.headers = request.headers ? request.headers : {};
        if (!request.headers[LoaderHeader.connect]) {
            request.headers[LoaderHeader.connect] = !parsed.version ? "open" : "close";
        }

        if (request.headers[LoaderHeader.cache] === false) {
            canCache = false;
        } else {
            // If connection header is pure open or close we will cache it. Otherwise custom load behavior
            // and so we will not cache the request
            canCache = request.headers[LoaderHeader.connect] === "open"
                || request.headers[LoaderHeader.connect] === "close";
        }

        const headerSeqNum = request.headers[LoaderHeader.sequenceNumber];
        if (headerSeqNum) {
            fromSequenceNumber = headerSeqNum;
        }

        // if set in both query string and headers, use query string
        request.headers[LoaderHeader.version] = parsed.version || request.headers[LoaderHeader.version];

        // version === null means not use any snapshot.
        if (request.headers[LoaderHeader.version] === "null") {
            request.headers[LoaderHeader.version] = null;
        }
        return {
            canCache,
            fromSequenceNumber,
        };
    }

    private loadContainer(
        id: string,
        documentService: IDocumentService,
        request: IRequest,
        resolved: IResolvedUrl,
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
            logger);

        return container;
    }
}
