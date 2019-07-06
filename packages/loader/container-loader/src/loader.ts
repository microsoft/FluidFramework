/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    IDocumentService,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IHost,
    ILoader,
    IRequest,
    IResolvedUrl,
    IResponse,
    ISequencedDocumentMessage,
    ITelemetryBaseLogger,
} from "@prague/container-definitions";
import { Deferred } from "@prague/utils";
import { EventEmitter } from "events";
// tslint:disable-next-line:no-var-requires
const now = require("performance-now") as () => number;
import * as querystring from "querystring";
import { parse } from "url";
import { Container } from "./container";
import { debug } from "./debug";

interface IParsedUrl {
    id: string;
    path: string;
    version: string;
}

// Protocol version supported by the loader
// const protocolVersions = ["^0.2.0", "^0.1.0"];

export class RelativeLoader extends EventEmitter implements ILoader {
    public static supportedInterfaces = ["ILoader"];

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

    public query(id: string): any {
        return Loader.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return Loader.supportedInterfaces;
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
            request.headers["fluid-cache"] === false ||
            request.headers["fluid-reconnect"] === false;

        return !noCache;
    }
}

/**
 * Manages Fluid resource loading
 */
export class Loader extends EventEmitter implements ILoader {
    public static supportedInterfaces = ["ILoader"];

    private readonly containers = new Map<string, Promise<Container>>();
    private readonly resolveCache = new Map<string, IFluidResolvedUrl>();

    constructor(
        private readonly containerHost: IHost,
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly codeLoader: ICodeLoader,
        private readonly options: any,
        private readonly logger?: ITelemetryBaseLogger,
    ) {
        super();

        if (!containerHost) {
            throw new Error("An IContainerHost must be provided");
        }

        if (!documentServiceFactory) {
            throw new Error("An IDocumentService must be provided");
        }

        if (!codeLoader) {
            throw new Error("An ICodeLoader must be provided");
        }
    }

    public query(id: string): any {
        return Loader.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return Loader.supportedInterfaces;
    }

    public async resolve(request: IRequest): Promise<Container> {
        debug(`Container resolve: ${now()} `);

        const resolved = await this.resolveCore(request);
        return resolved.container;
    }

    public async request(request: IRequest): Promise<IResponse> {
        debug(`Container loading: ${now()} `);

        const resolved = await this.resolveCore(request);
        return resolved.container!.request({ url: resolved.parsed!.path });
    }

    private parseUrl(url: string): IParsedUrl | null {
        const parsed = parse(url);
        const qs = querystring.parse(parsed.query!);
        let qsVersion: string | string[] | null;

        // null is required later if you don't want to make the get latest version call.
        // there is no way to encode null in a query string
        if (qs.version === "null") {
            qsVersion = null;
        } else {
            qsVersion = qs.version;
        }

        const regex = /^\/([^\/]*\/[^\/]*)(\/?.*)$/;
        const match = parsed.pathname!.match(regex);

        return (match && match.length === 3)
            ? { id: match[1], path: match[2], version: qsVersion as string }
            : null;
    }

    private async resolveCore(
        request: IRequest,
    ): Promise<{ container: Container, parsed: IParsedUrl }> {
        // Resolve the given request to a URL
        // Check for an already resolved URL otherwise make a new request
        if (!this.resolveCache.has(request.url)) {
            const toCache = await this.containerHost.resolver.resolve(request);
            if (toCache.type !== "prague") {
                return Promise.reject("Only Fluid components currently supported");
            }
            this.resolveCache.set(request.url, toCache);
        }
        const resolved = this.resolveCache.get(request.url)!;

        // Parse URL into components
        const resolvedAsFluid = resolved as IFluidResolvedUrl;
        const parsed = this.parseUrl(resolvedAsFluid.url);
        if (!parsed) {
            return Promise.reject(`Invalid URL ${resolvedAsFluid.url}`);
        }

        let canCache = true;
        let canReconnect = true;
        let connection = !parsed!.version ? "open" : "close";
        let version = parsed!.version;
        let fromSequenceNumber = -1;

        if (request.headers) {
            if (request.headers.connect) {
                // If connection header is pure open or close we will cache it. Otherwise custom load behavior
                // and so we will not cache the request
                canCache = request.headers.connect === "open" || request.headers.connect === "close";
                connection = request.headers.connect as string;
            }

            if (request.headers["fluid-cache"] === false) {
                canCache = false;
            }

            if (request.headers["fluid-reconnect"] === false) {
                canReconnect = false;
            }

            if (request.headers["fluid-sequence-number"]) {
                fromSequenceNumber = request.headers["fluid-sequence-number"] as number;
            }

            version = version || request.headers.version as string;
        }

        debug(`${canCache} ${connection} ${version}`);
        const documentService = await this.documentServiceFactory.createDocumentService(resolved);

        let container: Container;
        if (canCache) {
            const versionedId = version ? `${parsed!.id}@${version}` : parsed!.id;
            if (!this.containers.has(versionedId)) {
                const containerP =
                    this.loadContainer(
                        parsed!.id,
                        version,
                        connection,
                        documentService,
                        request,
                        resolved,
                        canReconnect,
                        this.logger);
                this.containers.set(versionedId, containerP);
            }

            // container must exist since explicitly set above
            container = (await this.containers.get(versionedId) as Container);
        } else {
            container =
                await this.loadContainer(
                    parsed!.id,
                    version,
                    connection,
                    documentService,
                    request,
                    resolved,
                    canReconnect,
                    this.logger);
        }

        if (container.deltaManager!.referenceSequenceNumber <= fromSequenceNumber) {
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

    private loadContainer(
        id: string,
        version: string,
        connection: string,
        documentService: IDocumentService,
        request: IRequest,
        resolved: IResolvedUrl,
        canReconnect: boolean,
        logger?: ITelemetryBaseLogger,
    ): Promise<Container> {
        const container = Container.load(
            id,
            version,
            documentService,
            this.codeLoader,
            this.options,
            connection,
            this,
            request,
            canReconnect,
            logger);

        return container;
    }
}
