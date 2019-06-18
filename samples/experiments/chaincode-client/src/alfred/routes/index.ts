/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import { ChainDb } from "../chainDb";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(config: Provider, db: ChainDb): Router {

    const router: Router = Router();
    const deltasRoute = deltas.create(config, db);
    const documentsRoute = documents.create(config, db);

    router.use(cors());
    router.use("/deltas", deltasRoute);
    router.use("/documents", documentsRoute);

    return router;
}
