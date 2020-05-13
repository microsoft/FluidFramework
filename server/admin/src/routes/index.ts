/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import core from "@microsoft/fluid-server-services-core";
import ensureAuth from "connect-ensure-login";
import { Router } from "express";
import { Provider } from "nconf";
import { KeyValueWrapper } from "../keyValueWrapper";
import { TenantManager } from "../tenantManager";
import api from "./api";
import home from "./home";

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

    const keyValueWrapper = new KeyValueWrapper(config);

    return {
        api: api.create(config, mongoManager, ensureLoggedIn, tenantManager, keyValueWrapper),
        home: home.create(config, mongoManager, ensureLoggedIn, tenantManager, keyValueWrapper),
    };
}
