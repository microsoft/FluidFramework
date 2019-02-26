import {
    ICodeLoader,
    IDocumentService,
    IHost,
} from "@prague/container-definitions";
import { IWork} from "../definitions";
import { ChaincodeWork } from "./chaincodeWork";

export class IntelWork extends ChaincodeWork implements IWork {
    constructor(
        docId: string,
        tenantId: string,
        host: IHost,
        service: IDocumentService,
        codeLoader: ICodeLoader,
    ) {
        super(docId, tenantId, host, service, codeLoader);
    }

    public async start(): Promise<void> {
        return this.loadChaincode({ localMinSeq: 0, encrypted: undefined, client: { type: "intel" } }, true);
    }

    public async stop(): Promise<void> {
        return super.stop();
    }
}
