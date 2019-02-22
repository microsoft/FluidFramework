import {
    ICodeLoader,
    IDocumentService,
    ITokenProvider,
} from "@prague/container-definitions";
import { IWork} from "../definitions";
import { ChaincodeWork } from "./chaincodeWork";

export class IntelWork extends ChaincodeWork implements IWork {
    constructor(
        docId: string,
        tenantId: string,
        tokenProvider: ITokenProvider,
        service: IDocumentService,
        codeLoader: ICodeLoader) {
        super(docId, tenantId, tokenProvider, service, codeLoader);
    }

    public async start(): Promise<void> {
        return this.loadChaincode({ localMinSeq: 0, encrypted: undefined, client: { type: "intel" } });
    }

    public async stop(): Promise<void> {
        return super.stop();
    }
}
