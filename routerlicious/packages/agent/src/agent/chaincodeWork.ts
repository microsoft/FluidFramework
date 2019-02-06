import {
    ICodeLoader,
    IDocumentService,
    IPlatformFactory,
    ITokenProvider,
} from "@prague/container-definitions";
import { Loader } from "@prague/container-loader";
import { EventEmitter } from "events";
import { IWork } from "./definitions";

export class ChaincodeWork extends EventEmitter implements IWork {
    private events = new EventEmitter();
    constructor(
        private readonly docId: string,
        private readonly tenantId: string,
        private readonly tokenProvider: ITokenProvider,
        private readonly service: IDocumentService,
        private readonly codeLoader: ICodeLoader,
        platformFactory: IPlatformFactory,
    ) {
        super();
    }

    public async loadChaincode(): Promise<void> {
        const loader = new Loader(
            { tokenProvider: this.tokenProvider },
            this.service,
            this.codeLoader,
            null);

        const url =
            `prague://prague.com/` +
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
