import {
    ICodeLoader,
    IDocumentService,
    IHost,
    IPlatformFactory,
} from "@prague/container-definitions";
import { Loader } from "@prague/container-loader";
import { EventEmitter } from "events";
import { parse } from "url";
import { IWork } from "./definitions";

export class ChaincodeWork extends EventEmitter implements IWork {
    private events = new EventEmitter();
    constructor(
        private readonly alfred: string,
        private readonly docId: string,
        private readonly tenantId: string,
        private readonly host: IHost,
        private readonly service: IDocumentService,
        private readonly codeLoader: ICodeLoader,
        platformFactory: IPlatformFactory,
    ) {
        super();
    }

    public async loadChaincode(): Promise<void> {
        const loader = new Loader(
            this.host,
            this.service,
            this.codeLoader,
            null);

        const url =
            `prague://${parse(this.alfred).host}/` +
            `${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.docId)}`;
        const document = await loader.resolve({ url });
        const quorum = document.getQuorum();

        quorum.on("addMember", (clientId, details) => console.log(`${clientId} joined`));
        quorum.on("removeMember", (clientId) => console.log(`${clientId} left`));
    }

    public async start(task: string): Promise<void> {
        await this.loadChaincode();
        // Do chaincode specific task here.
    }

    public async stop(): Promise<void> {
        // Stop here.
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListeners() {
        this.events.removeAllListeners();
        this.removeAllListeners();
    }
}
