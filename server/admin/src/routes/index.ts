/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { promiseTimeout } from "@prague/services-client";
import * as core from "@prague/services-core";
import * as ensureAuth from "connect-ensure-login";
import { Router } from "express";
import { Provider } from "nconf";
import { KeyValueManager } from "../keyValueManager";
import { TenantManager } from "../tenantManager";
import * as api from "./api";
import * as home from "./home";

export interface IRoutes {
    home: Router;
    api: Router;
}

export function create(
    config: Provider,
    mongoManager: core.MongoManager,
    tenantManager: TenantManager): IRoutes {

    const ensureLoggedIn = config.get("login:enabled")
    ? ensureAuth.ensureLoggedIn
    : () => {
        return (req, res, next) => next();
    };

    const kvManagerP = promiseTimeout(15000, KeyValueManager.load(config));
    return {
        api: api.create(config, mongoManager, ensureLoggedIn, tenantManager, kvManagerP),
        home: home.create(config, mongoManager, ensureLoggedIn, tenantManager, kvManagerP),
    };
}
