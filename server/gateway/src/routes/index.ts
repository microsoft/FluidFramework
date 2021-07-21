/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { ICache } from "@fluidframework/server-services-core";
import ensureAuth from "connect-ensure-login";
import { Provider } from "nconf";
import { IAlfred } from "../interfaces";
import { KeyValueWrapper, LocalKeyValueWrapper } from "../keyValueWrapper";
import * as api from "./api";
import * as home from "./home";
import * as loader from "./loader";
import * as loaderFramed from "./loaderFramed";
import * as loaderFrs from "./loaderFrs";
import * as token from "./token";
import * as versions from "./versions";

export function create(
    config: Provider,
    cache: ICache,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    urlResolver: (id: string) => string,
) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const ensureLoggedIn = config.get("login:enabled")
        ? ensureAuth.ensureLoggedIn
        : () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return (req, res, next) => next();
        };

    const loadKeyValue = config.get("keyValue:load") as boolean;
    const keyValueWrapper = loadKeyValue ? new KeyValueWrapper(config) : new LocalKeyValueWrapper();
    return {
        api: api.create(config, appTenants),
        home: home.create(config, ensureLoggedIn),
        loader: loader.create(config, alfred, appTenants, ensureLoggedIn, keyValueWrapper),
        loaderFramed: loaderFramed.create(config, alfred, appTenants, ensureLoggedIn, keyValueWrapper),
        loaderFrs: loaderFrs.create(config, alfred, appTenants, ensureLoggedIn, keyValueWrapper),
        token: token.create(alfred),
        versions: versions.create(alfred, ensureLoggedIn),
    };
}
