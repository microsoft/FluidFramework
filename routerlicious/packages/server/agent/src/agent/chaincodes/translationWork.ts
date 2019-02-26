import {
    ICodeLoader,
    IDocumentService,
    IHost,
} from "@prague/container-definitions";
import { IWork} from "../definitions";
import { ChaincodeWork } from "./chaincodeWork";

export class TranslationWork extends ChaincodeWork implements IWork {
    constructor(
        docId: string,
        tenantId: string,
        host: IHost,
        service: IDocumentService,
        codeLoader: ICodeLoader) {
        super(docId, tenantId, host, service, codeLoader);
    }

    public async start(): Promise<void> {
        return this.loadChaincode({ encrypted: undefined, localMinSeq: 0, client: { type: "translation"} }, true);
    }

    public async stop(): Promise<void> {
        return super.stop();
    }
}
