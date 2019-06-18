/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    IDocumentServiceFactory,
    IHost,
} from "@prague/container-definitions";
import { IWork} from "../definitions";
import { ChaincodeWork } from "./chaincodeWork";

export class SpellcheckerWork extends ChaincodeWork implements IWork {
    constructor(
        alfred: string,
        docId: string,
        tenantId: string,
        host: IHost,
        serviceFactory: IDocumentServiceFactory,
        codeLoader: ICodeLoader,
        workType: string) {
        super(alfred, docId, tenantId, host, serviceFactory, codeLoader, workType);
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
