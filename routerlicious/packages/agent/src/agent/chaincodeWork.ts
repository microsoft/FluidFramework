import {
    IDocumentService,
    IPlatformFactory,
    ITokenProvider,
} from "@prague/container-definitions";
import * as loader from "@prague/loader";
import { ICodeLoader } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { IWork } from "./definitions";

export class ChaincodeWork extends EventEmitter implements IWork {
    private events = new EventEmitter();
    constructor(
        private docId: string,
        private tenantId: string,
        private tokenProvider: ITokenProvider,
        private service: IDocumentService,
        private codeLoader: ICodeLoader,
        private platformFactory: IPlatformFactory) {
            super();
    }

    public async loadChaincode(): Promise<void> {
            const documentP = loader.load(
                this.docId,
                this.tenantId,
                this.tokenProvider,
                null,
                this.platformFactory,
                this.service,
                this.codeLoader);
            const document = await documentP;
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
