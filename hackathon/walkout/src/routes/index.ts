import * as ensureAuth from "connect-ensure-login";
import { Router } from "express";
import { Provider } from "nconf";
import * as auth from "./auth";
import * as home from "./home";

export function create(config: Provider): { auth: Router, home: Router } {
    return {
        auth: auth.create(),
        home: home.create(config, ensureAuth.ensureLoggedIn),
    };
}
