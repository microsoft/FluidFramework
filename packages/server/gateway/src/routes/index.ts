/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAlfredTenant, ICache } from "@prague/services-core";
import * as ensureAuth from "connect-ensure-login";
import { Provider } from "nconf";
import { IAlfred } from "../interfaces";
import { KeyValueManager } from "../keyValueManager";
import * as api from "./api";
import * as demoCreator from "./democreator";
import * as fastloader from "./fastLoader";
import * as fork from "./fork";
import * as home from "./home";
import * as loader from "./loader";
import * as maps from "./maps";
import * as scribe from "./scribe";
import * as sharedText from "./sharedText";
import * as templates from "./templates";
import * as versions from "./versions";

export function create(
    config: Provider,
    cache: ICache,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    keyValueManager: KeyValueManager,
    urlResolver: (id: string) => string,
) {
    const ensureLoggedIn = config.get("login:enabled")
        ? ensureAuth.ensureLoggedIn
        : () => {
            return (req, res, next) => next();
        };

    return {
        api: api.create(config, appTenants),
        demoCreator: demoCreator.create(ensureLoggedIn),
        fastLoader: fastloader.create(config, cache, appTenants, ensureLoggedIn, urlResolver),
        fork: fork.create(alfred, ensureLoggedIn),
        home: home.create(config, ensureLoggedIn),
        loader: loader.create(config, alfred, appTenants, keyValueManager, ensureLoggedIn),
        maps: maps.create(config, appTenants, ensureLoggedIn),
        scribe: scribe.create(config, appTenants, ensureLoggedIn),
        sharedText: sharedText.create(config, alfred, appTenants, ensureLoggedIn),
        templates: templates.create(config),
        versions: versions.create(alfred, ensureLoggedIn),
    };
}
