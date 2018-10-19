import { Router } from "express";
import * as nconf from "nconf";
import { ICache } from "../services";
import * as contents from "./contents";

export interface IRoutes {
    files: Router;
}

export function create(store: nconf.Provider, cache: ICache): IRoutes {
    return {
        files: contents.create(store, cache),
    };
}
