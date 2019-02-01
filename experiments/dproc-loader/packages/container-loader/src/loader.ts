import {
    ICodeLoader,
    IDocumentService,
    IHost,
    IResponse,
} from "@prague/container-definitions";
import { EventEmitter } from "events";
// tslint:disable-next-line:no-var-requires
const now = require("performance-now") as () => number;
import * as url from "url";
import { Container } from "./container";
import { debug } from "./debug";

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

    public async load(uri: string): Promise<IResponse> {
        debug(`Container loading: ${now()} `);

        const parsed = url.parse(uri);

        const regex = /^\/([^\/]*\/[^\/]*)\/?(.*)$/;
        const match = parsed.pathname.match(regex);

        if (!match || match.length !== 3) {
            return Promise.reject("Invalid URI");
        }

        const id = match[1];
        const path = match[2];

        if (!this.containers.has(id)) {
            const containerP = Container.Load(
                id,
                this.containerHost,
                this.documentService,
                this.codeLoader,
                this.options);
            this.containers.set(id, containerP);
        }

        const container = await this.containers.get(id);
        return container.request(path);
    }
}
