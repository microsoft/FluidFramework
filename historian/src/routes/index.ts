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
    gitService: services.IGitService): IRoutes {

    return {
        git: {
            blobs: blobs.create(store, gitService),
            commits: commits.create(store, gitService),
            refs: refs.create(store, gitService),
            repos: repos.create(store, gitService),
            tags: tags.create(store, gitService),
            trees: trees.create(store, gitService),
        },
        repository: {
            commits: repositoryCommits.create(store, gitService),
            contents: contents.create(store, gitService),
        },
    };
}
