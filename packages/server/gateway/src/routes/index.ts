/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { promiseTimeout } from "@prague/services-client";
import { IAlfredTenant, ICache } from "@prague/services-core";
import * as ensureAuth from "connect-ensure-login";
import { Provider } from "nconf";
import { IAlfred } from "../interfaces";
import { KeyValueLoader } from "../keyValueLoader";
import * as api from "./api";
import * as demoCreator from "./democreator";
import * as fastloader from "./fastLoader";
import * as fork from "./fork";
import * as frontpage from "./frontpage";
import * as home from "./home";
import * as loader from "./loader";
import * as maps from "./maps";
import * as scribe from "./scribe";
import * as sharedText from "./sharedText";
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
    const ensureLoggedIn = config.get("login:enabled")
        ? ensureAuth.ensureLoggedIn
        : () => {
            return (req, res, next) => next();
        };
    const cacheLoadTimeoutMS = 10000;

    const keyValueLoaderP = promiseTimeout(cacheLoadTimeoutMS, KeyValueLoader.load(config));
    const cacheP = keyValueLoaderP.then((keyValueLoader: KeyValueLoader) => {
        return keyValueLoader.cache;
    }, (err) => {
        return Promise.reject(err);
    });

    return {
        api: api.create(config, appTenants),
        demoCreator: demoCreator.create(ensureLoggedIn),
        fastLoader: fastloader.create(config, cache, appTenants, ensureLoggedIn, urlResolver),
        fork: fork.create(alfred, ensureLoggedIn),
        frontpage: frontpage.create(config, alfred, appTenants, ensureLoggedIn, cacheP),
        home: home.create(config, ensureLoggedIn),
        loader: loader.create(config, alfred, appTenants, ensureLoggedIn, cacheP),
        maps: maps.create(config, appTenants, ensureLoggedIn),
        scribe: scribe.create(config, appTenants, ensureLoggedIn),
        sharedText: sharedText.create(config, alfred, appTenants, ensureLoggedIn),
        templates: templates.create(config),
        token: token.create(alfred),
        versions: versions.create(alfred, ensureLoggedIn),
        waterpark: waterpark.create(config, alfred, appTenants, ensureLoggedIn),
    };
}
