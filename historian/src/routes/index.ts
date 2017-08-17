import { Router } from "express";
import * as nconf from "nconf";
import * as services from "../services";
import * as blobs from "./git/blobs";
import * as commits from "./git/commits";
import * as refs from "./git/refs";
import * as repos from "./git/repos";
import * as tags from "./git/tags";
import * as trees from "./git/trees";
import * as repositoryCommits from "./repository/commits";
import * as contents from "./repository/contents";

export interface IRoutes {
    git: {
        blobs: Router;
        commits: Router;
        refs: Router;
        repos: Router;
        tags: Router;
        trees: Router;
    };
    repository: {
        commits: Router;
        contents: Router;
    };
}

export function create(
    store: nconf.Provider,
    gitService: services.IGitService,
    cacheService: services.ICache): IRoutes {

    return {
        git: {
            blobs: blobs.create(store, gitService, cacheService),
            commits: commits.create(store, gitService, cacheService),
            refs: refs.create(store, gitService, cacheService),
            repos: repos.create(store, gitService, cacheService),
            tags: tags.create(store, gitService, cacheService),
            trees: trees.create(store, gitService, cacheService),
        },
        repository: {
            commits: repositoryCommits.create(store, gitService, cacheService),
            contents: contents.create(store, gitService, cacheService),
        },
    };
}
