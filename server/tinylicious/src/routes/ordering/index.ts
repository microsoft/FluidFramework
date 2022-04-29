/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorage,
    MongoManager,
} from "@fluidframework/server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(
    config: Provider,
    storage: IDocumentStorage,
    mongoManager: MongoManager,
): Router {
    const router: Router = Router();
    const deltasRoute = deltas.create(config, mongoManager);
    const documentsRoute = documents.create(storage);

    router.use("/deltas", deltasRoute);
    router.use("/documents", documentsRoute);

    return router;
}
