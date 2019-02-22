import {
    ICodeLoader,
    IDocumentService,
    ITokenProvider,
} from "@prague/container-definitions";
import { IWork} from "../definitions";
import { ChaincodeWork } from "./chaincodeWork";

export class SpellcheckerWork extends ChaincodeWork implements IWork {
    constructor(
        docId: string,
        tenantId: string,
        tokenProvider: ITokenProvider,
        service: IDocumentService,
        codeLoader: ICodeLoader) {
        super(docId, tenantId, tokenProvider, service, codeLoader);
    }

    public async start(): Promise<void> {
        return this.loadChaincode(
            {
                blockUpdateMarkers: true,
                client: { type: "spell"},
                encrypted: undefined,
                localMinSeq: 0,
            });
    }

    public async stop(): Promise<void> {
        return super.stop();
    }
}
