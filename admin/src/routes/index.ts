import * as utils from "@prague/routerlicious/dist/utils";
import * as ensureAuth from "connect-ensure-login";
import { Router } from "express";
import { Provider } from "nconf";
import * as api from "./api";
import * as home from "./home";

export interface IRoutes {
    home: Router;
    api: Router;
}

export function create(config: Provider, mongoManager: utils.MongoManager): IRoutes {
    return {
        api: api.create(config, mongoManager, ensureAuth.ensureLoggedIn),
        home: home.create(config, mongoManager, ensureAuth.ensureLoggedIn),
    };
}
