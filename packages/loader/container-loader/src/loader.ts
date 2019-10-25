/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    HeaderKey,
    IComponent,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    ICodeLoader,
    IHost,
    ILoader,
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
            const container = this.canUseCache(request)
                ? await this.containerDeferred.promise
                : await this.loader.resolve({ url: this.baseRequest.url, headers: request.headers });
            return container.request(request);
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
            request.headers[HeaderKey.cache] === false ||
            request.headers[HeaderKey.reconnect] === false;

        return !noCache;
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

        let canCache = true;
        let fromSequenceNumber = -1;

        request.headers = request.headers ? request.headers : {};
        if (!request.headers[HeaderKey.connect]) {
            request.headers[HeaderKey.connect] = !parsed.version ? "open" : "close";
        }

        if (request.headers[HeaderKey.cache] === false) {
            canCache = false;
        } else {
            // If connection header is pure open or close we will cache it. Otherwise custom load behavior
            // and so we will not cache the request
            canCache = request.headers[HeaderKey.connect] === "open" || request.headers[HeaderKey.connect] === "close";
        }

        if (request.headers[HeaderKey.sequenceNumber]) {
            fromSequenceNumber = request.headers[HeaderKey.sequenceNumber] as number;
        }

        // if set in both query string and headers, use query string
        request.headers.version = parsed.version || request.headers.version as string;

        // version === null means not use any snapshot.
        if (request.headers.version === "null") {
            request.headers.version = null;
        }

        debug(`${canCache} ${request.headers[HeaderKey.connect]} ${request.headers.version}`);
        const factory: IDocumentServiceFactory =
            selectDocumentServiceFactoryForProtocol(resolvedAsFluid, this.protocolToDocumentFactoryMap);

        const documentService: IDocumentService = await factory.createDocumentService(resolvedAsFluid);

        let container: Container;
        if (canCache) {
            const versionedId = request.headers.version ? `${parsed.id}@${request.headers.version}` : parsed.id;
            const maybeContainer = await this.containers.get(versionedId);
            if (maybeContainer) {
                container = maybeContainer;
            } else {
                const containerP =
                    this.loadContainer(
                        parsed.id,
                        documentService,
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
                    documentService,
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

    // @param version -one of the following
    //   - null: use ops, no snapshots
    //   - undefined - fetch latest snapshot
    //   - otherwise, version sha to load snapshot
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
