import {
    ICodeLoader,
    IDocumentService,
    IHost,
} from "@prague/container-definitions";
import { IWork} from "../definitions";
import { ChaincodeWork } from "./chaincodeWork";

export class SpellcheckerWork extends ChaincodeWork implements IWork {
    constructor(
        docId: string,
        tenantId: string,
        host: IHost,
        service: IDocumentService,
        codeLoader: ICodeLoader) {
        super(docId, tenantId, host, service, codeLoader);
    }

    public async start(): Promise<void> {
        return this.loadChaincode(
            {
                blockUpdateMarkers: true,
                client: { type: "spell"},
                encrypted: undefined,
                localMinSeq: 0,
            },
            true);
    }

    public async stop(): Promise<void> {
        return super.stop();
    }
}
