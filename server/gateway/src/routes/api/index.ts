/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAlfredTenant } from "@fluidframework/server-services-client";
import cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import * as api from "./api";

export function create(
    config: Provider,
    appTenants: IAlfredTenant[]): Router {
    const router: Router = Router();
    const apiRoute = api.create(config, appTenants);

    router.use(cors());
    router.use("/api/v1", apiRoute);

    return router;
}
