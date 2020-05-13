/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import { ICache } from "@microsoft/fluid-server-services-core";
import ensureAuth from "connect-ensure-login";
import { Provider } from "nconf";
import { IAlfred } from "../interfaces";
import { KeyValueWrapper, LocalKeyValueWrapper } from "../keyValueWrapper";
import api from "./api";
import demoCreator from "./democreator";
import fastloader from "./fastLoader";
import fork from "./fork";
import frontpage from "./frontpage";
import home from "./home";
import loader from "./loader";
import loaderFramed from "./loaderFramed";
import templates from "./templates";
import token from "./token";
import versions from "./versions";
import waterpark from "./waterpark";

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
