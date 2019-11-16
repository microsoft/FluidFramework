/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeLoader, IHost } from "@microsoft/fluid-container-definitions";
import { IDocumentServiceFactory } from "@microsoft/fluid-driver-definitions";
import { IWork } from "../definitions";
import { ChaincodeWork } from "./chaincodeWork";

export class SnapshotWork extends ChaincodeWork implements IWork {
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
        return this.loadChaincode( { encrypted: undefined, client: { type: "snapshot"} }, false);
    }

    public async stop(): Promise<void> {
        return super.stop();
    }
}
