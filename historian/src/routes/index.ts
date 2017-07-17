import { Router } from "express";
import * as nconf from "nconf";
import * as blobs from "./blobs";
import * as commits from "./commits";
import * as refs from "./refs";
import * as repos from "./repos";
import * as trees from "./trees";

export interface IRoutes {
    blobs: Router;
    commits: Router;
    refs: Router;
    repos: Router;
    trees: Router;
}

export function create(store: nconf.Provider): IRoutes {
    return {
        blobs: blobs.create(store),
        commits: commits.create(store),
        refs: refs.create(store),
        repos: repos.create(store),
        trees: trees.create(store),
    };
}
