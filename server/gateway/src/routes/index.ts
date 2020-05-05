/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import { ICache } from "@microsoft/fluid-server-services-core";
import * as ensureAuth from "connect-ensure-login";
import { Provider } from "nconf";
import { IAlfred } from "../interfaces";
import { KeyValueWrapper, LocalKeyValueWrapper } from "../keyValueWrapper";
import * as api from "./api";
import * as demoCreator from "./democreator";
import * as fastloader from "./fastLoader";
import * as fork from "./fork";
import * as frontpage from "./frontpage";
import * as home from "./home";
import * as loader from "./loader";
import * as loaderFramed from "./loaderFramed";
import * as templates from "./templates";
import * as token from "./token";
import * as versions from "./versions";
import * as waterpark from "./waterpark";

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
            return (req, res, next) => next();
        };

    const loadKeyValue = config.get("keyValue:load") as boolean;
    const keyValueWrapper = loadKeyValue ? new KeyValueWrapper(config) : new LocalKeyValueWrapper();
    return {
        api: api.create(config, appTenants),
        demoCreator: demoCreator.create(ensureLoggedIn),
        fastLoader: fastloader.create(config, cache, appTenants, ensureLoggedIn, urlResolver),
        fork: fork.create(alfred, ensureLoggedIn),
        frontpage: frontpage.create(config, alfred, appTenants, ensureLoggedIn, keyValueWrapper),
        home: home.create(config, ensureLoggedIn),
        loader: loader.create(config, alfred, appTenants, ensureLoggedIn, keyValueWrapper),
        loaderFramed: loaderFramed.create(config, alfred, appTenants, ensureLoggedIn, keyValueWrapper),
        templates: templates.create(config),
        token: token.create(alfred),
        versions: versions.create(alfred, ensureLoggedIn),
        waterpark: waterpark.create(config, alfred, appTenants, ensureLoggedIn),
    };
}
