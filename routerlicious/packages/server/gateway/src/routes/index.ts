import { IAlfredTenant, ICache } from "@prague/services-core";
import * as ensureAuth from "connect-ensure-login";
import { Provider } from "nconf";
import * as api from "./api";
import * as demoCreator from "./democreator";
import * as home from "./home";
import * as templates from "./templates";

export function create(
    config: Provider,
    cache: ICache,
    appTenants: IAlfredTenant[],
    urlResolver: (id: string) => string,
) {
    const ensureLoggedIn = config.get("login:enabled") ? ensureAuth.ensureLoggedIn :
        (options) => {
            return (req, res, next) => next();
        };

    return {
        api: api.create(config, appTenants),
        demoCreator: demoCreator.create(ensureLoggedIn),
        home: home.create(config, ensureLoggedIn),
        templates: templates.create(config),
    };
}
