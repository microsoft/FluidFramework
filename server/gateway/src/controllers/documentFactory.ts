/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoader } from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/common-utils";
import Axios from "axios";

/* TODO: @fluid-example packages are not published. Duplicate the interface here for now */
// import { IDocumentFactory } from "@fluid-example/host-service-interfaces";
import { IDocumentFactory } from "./services";

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
            return Promise.reject(new Error("Code has already been proposed on document"));
        }

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        quorum.propose("code", chaincode);

        return url;
    }
}
