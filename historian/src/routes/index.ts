import { Router } from "express";
import * as nconf from "nconf";
import * as blobs from "./blobs";
import * as repos from "./repos";

export interface IRoutes {
    blobs: Router;
    repos: Router;
}

export function create(store: nconf.Provider): IRoutes {
    return {
        blobs: blobs.create(store),
        repos: repos.create(store),
    };
}
