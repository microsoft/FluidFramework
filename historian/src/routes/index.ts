import { Router } from "express";
import * as nconf from "nconf";
import * as repos from "./repos";

export interface IRoutes {
    repos: Router;
}

export function create(store: nconf.Provider): IRoutes {
    return {
        repos: repos.create(store),
    };
}
