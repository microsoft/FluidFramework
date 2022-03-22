/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICache,
    ICollection,
    IDocument,
    IDocumentStorage,
    IProducer,
    ITenantManager,
    IThrottler,
    MongoManager,
} from "@fluidframework/server-services-core";
import cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import * as api from "./api";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    throttler: IThrottler,
    singleUseTokenCache: ICache,
    storage: IDocumentStorage,
    operationsDbMongoManager: MongoManager,
    producer: IProducer,
    appTenants: IAlfredTenant[],
    documentsCollection: ICollection<IDocument>): Router {
    const router: Router = Router();
    const deltasRoute = deltas.create(config, tenantManager, operationsDbMongoManager, appTenants, throttler);
    const documentsRoute = documents.create(
        storage,
        appTenants,
        throttler,
        singleUseTokenCache,
        config,
        tenantManager,
        documentsCollection);
    const apiRoute = api.create(config, producer, tenantManager, storage, throttler);

    router.use(cors());
    router.use("/deltas", deltasRoute);
    router.use("/documents", documentsRoute);
    router.use("/api/v1", apiRoute);

    return router;
}
