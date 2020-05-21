/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import * as cors from "cors";
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
