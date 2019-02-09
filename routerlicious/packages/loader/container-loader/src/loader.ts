import {
    ICodeLoader,
    IDocumentService,
    IHost,
    IRequest,
    IResponse,
} from "@prague/container-definitions";
import { EventEmitter } from "events";
// tslint:disable-next-line:no-var-requires
const now = require("performance-now") as () => number;
import { parse } from "url";
import { Container } from "./container";
import { debug } from "./debug";

interface IParsedUrl {
    id: string;
    path: string;
}

/**
 * Manages Prague resource loading
 */
export class Loader extends EventEmitter {
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

    public async resolve(request: IRequest): Promise<Container> {
        debug(`Container resolve: ${now()} `);

        const parsed = this.parseUrl(request.url);
        if (!parsed) {
            return Promise.reject("Invalid URI");
        }

        return this.resolveCore(parsed.id);
    }

    public async request(request: IRequest): Promise<IResponse> {
        debug(`Container loading: ${now()} `);

        const parsed = this.parseUrl(request.url);
        if (!parsed) {
            return Promise.reject("Invalid URI");
        }

        const container = await this.resolveCore(parsed.id);
        return container.request({ url: parsed.path });
    }

    private parseUrl(url: string): IParsedUrl {
        const parsed = parse(url);

        const regex = /^\/([^\/]*\/[^\/]*)(\/?.*)$/;
        const match = parsed.pathname.match(regex);

        return (match && match.length === 3) ? { id: match[1], path: match[2] } : null;
    }

    private resolveCore(id: string) {
        if (!this.containers.has(id)) {
            const containerP = Container.Load(
                id,
                this.containerHost,
                this.documentService,
                this.codeLoader,
                this.options);
            this.containers.set(id, containerP);
        }

        return this.containers.get(id);
    }
}
