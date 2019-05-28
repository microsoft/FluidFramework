import {
    ICodeLoader,
    IDocumentService,
    IDocumentServiceFactory,
    IHost,
    ILoader,
    IPragueResolvedUrl,
    IRequest,
    IResponse,
    ITelemetryBaseLogger,
} from "@prague/container-definitions";
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

/**
 * Manages Prague resource loading
 */
export class Loader extends EventEmitter implements ILoader {
    private containers = new Map<string, Promise<Container>>();

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

    public async resolve(request: IRequest): Promise<Container | undefined> {
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

    private async resolveCore(request: IRequest):
        Promise<{ container: Container | undefined, parsed: IParsedUrl | null }> {
        // Resolve the given request to a URL
        const resolved = await this.containerHost.resolver.resolve(request);
        if (resolved.type !== "prague") {
            return Promise.reject("Only Prague components currently supported");
        }

        const resolvedAsPrague = resolved as IPragueResolvedUrl;
        const parsed = this.parseUrl(resolvedAsPrague.url);

        let canCache = true;
        let connection = !parsed!.version ? "open" : "close";
        let version = parsed!.version;

        if (request.headers) {
            if (request.headers.connect) {
                // If connection header is pure open or close we will cache it. Otherwise custom load behavior
                // and so we will not cache the request
                canCache = request.headers.connect === "open" || request.headers.connect === "close";
                connection = request.headers.connect as string;
            }

            version = version || request.headers.version as string;
        }

        debug(`${canCache} ${connection} ${version}`);
        const documentService = await this.documentServiceFactory.createDocumentService(resolved);

        let container: Container | undefined;
        if (canCache) {
            const versionedId = version ? `${parsed!.id}@${version}` : parsed!.id;
            if (!this.containers.has(versionedId)) {
                const containerP =
                    this.loadContainer(
                        parsed!.id,
                        version,
                        connection,
                        documentService,
                        this.logger);
                this.containers.set(versionedId, containerP);
            }

            container = await this.containers.get(versionedId);
        } else {
            container =
                await this.loadContainer(
                    parsed!.id,
                    version,
                    connection,
                    documentService,
                    this.logger);
        }

        return { container, parsed };
    }

    private async loadContainer(
        id: string,
        version: string,
        connection: string,
        documentService: IDocumentService,
        logger?: ITelemetryBaseLogger,
    ): Promise<Container> {
        const container = await Container.Load(
            id,
            version,
            documentService,
            this.codeLoader,
            this.options,
            connection,
            this,
            logger);

        return container;
    }
}
