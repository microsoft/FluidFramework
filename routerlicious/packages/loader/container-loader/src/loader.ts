import {
    ICodeLoader,
    IDocumentService,
    IHost,
    ILoader,
    IPragueResolvedUrl,
    IRequest,
    IResponse,
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
        private readonly documentService: IDocumentService,
        private readonly codeLoader: ICodeLoader,
        private readonly options: any,
    ) {
        super();

        if (!containerHost) {
            throw new Error("An IContainerHost must be provided");
        }

        if (!documentService) {
            throw new Error("An IDocumentService must be provided");
        }

        if (!codeLoader) {
            throw new Error("An ICodeLoader must be provided");
        }
    }

    // On the initial boot what do I do? I guess they already have some kind of /joinSession thing which gives all
    // the deeets for something?
    // But our loader knows enough to return the resolved information. I suppose we could return this, along with
    // a token, and seed the system with it to begin with? Then you just do the request/resolve?
    // For refresh you just go look up the route again?

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

    private parseUrl(url: string): IParsedUrl {
        const parsed = parse(url);
        const qs = querystring.parse(parsed.query);

        const regex = /^\/([^\/]*\/[^\/]*)(\/?.*)$/;
        const match = parsed.pathname.match(regex);

        return (match && match.length === 3)
            ? { id: match[1], path: match[2], version: qs.version as string }
            : null;
    }

    private async resolveCore(request: IRequest): Promise<{ container: Container, parsed: IParsedUrl }> {
        // Resolve the given request to a URL
        const resolved = await this.containerHost.resolver.resolve(request);
        if (resolved.type !== "prague") {
            return Promise.reject("Only Prague components currently supported");
        }

        const resolvedAsPrague = resolved as IPragueResolvedUrl;
        const parsed = this.parseUrl(resolvedAsPrague.url);

        const versionedId = parsed.version ? `${parsed.id}@${parsed.version}` : parsed.id;
        if (!this.containers.has(versionedId)) {
            const tokenProvider = await this.documentService.createTokenProvider(resolvedAsPrague.tokens);

            const containerP = Container.Load(
                parsed.id,
                parsed.version,
                tokenProvider,
                this.documentService,
                this.codeLoader,
                this.options,
                this);
            this.containers.set(versionedId, containerP);
        }

        const container = await this.containers.get(versionedId);

        return { container, parsed };
    }
}
