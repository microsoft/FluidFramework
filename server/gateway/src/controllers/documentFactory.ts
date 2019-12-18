/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails, ILoader } from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-core-utils";
import { IDocumentFactory } from "@microsoft/fluid-host-service-interfaces";
import Axios from "axios";

export class DocumentFactory implements IDocumentFactory {
    private loaderDeferred = new Deferred<ILoader>();

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
        const monikerP = new Promise(async (resolve) => {
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
        ]);

        // generate a moniker to use as part of creating the new document
        const url = this.url ? this.url : `${window.location.origin}/loader/${this.tenantId}/${moniker}`;
        const resolved = await loader.resolve({ url });

        // TODO need connected flag on the IContainer
        if (!(resolved as any).connected) {
            await new Promise((r) => resolved.once("connected", r));
        }

        const quorum = resolved.getQuorum();
        if (quorum.has("code")) {
            return Promise.reject("Code has already been proposed on document");
        }

        quorum.propose("code", chaincode);

        return url;
    }
}
