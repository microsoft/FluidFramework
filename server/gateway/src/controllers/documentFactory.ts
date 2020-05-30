/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails, ILoader } from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-common-utils";
import { IDocumentFactory } from "@microsoft/fluid-host-service-interfaces";
import Axios from "axios";

export class DocumentFactory implements IDocumentFactory {
    private readonly loaderDeferred = new Deferred<ILoader>();

    public get IDocumentFactory(): IDocumentFactory { return this; }

    constructor(private readonly tenantId: string,
        private readonly moniker?: string,
        private readonly url?: string) {
    }

    /**
     * Sets the loader the factory should used to create new documents with. We set after the fact given that
     * the loader is given its scope as part of construction.
     */
    public resolveLoader(loader: ILoader) {
        this.loaderDeferred.resolve(loader);
    }

    public async create(chaincode: IFluidCodeDetails): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
        const monikerP = new Promise(async (resolve) => {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (this.moniker) {
                resolve(this.moniker);
            } else {
                const res = await Axios.get("/api/v1/moniker");
                resolve(res.data);
            }
        });
        const [loader, moniker] = await Promise.all([
            this.loaderDeferred.promise,
            monikerP,
        ]) as [ILoader, unknown];

        // generate a moniker to use as part of creating the new document
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const url = this.url ? this.url : `${window.location.origin}/loader/${this.tenantId}/${moniker}`;
        const resolved = await loader.resolve({ url });

        // TODO need connected flag on the IContainer
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!(resolved as any).connected) {
            await new Promise((r) => resolved.once("connected", r));
        }

        const quorum = resolved.getQuorum();
        if (quorum.has("code")) {
            return Promise.reject("Code has already been proposed on document");
        }

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        quorum.propose("code", chaincode);

        return url;
    }
}
