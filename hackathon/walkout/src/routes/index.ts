import * as ensureAuth from "connect-ensure-login";
import { Router } from "express";
import { Provider } from "nconf";
import * as auth from "./auth";
import * as home from "./home";
import * as webhook from "./webhook";

export interface IRoutes {
    auth: Router;
    home: Router;
    webhook: Router;
}

export function create(config: Provider): IRoutes {
    return {
        auth: auth.create(),
        home: home.create(config, ensureAuth.ensureLoggedIn),
        webhook: webhook.create(),
    };
}
