import { Router } from "express";
import * as nconf from "nconf";
import * as blobs from "./git/blobs";
import * as commits from "./git/commits";
import * as refs from "./git/refs";
import * as repos from "./git/repos";
import * as tags from "./git/tags";
import * as trees from "./git/trees";
import * as repositoryCommits from "./repository/commits";

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
    };
}

export function create(store: nconf.Provider): IRoutes {
    return {
        git: {
            blobs: blobs.create(store),
            commits: commits.create(store),
            refs: refs.create(store),
            repos: repos.create(store),
            tags: tags.create(store),
            trees: trees.create(store),
        },
        repository: {
            commits: repositoryCommits.create(store),
        },
    };
}
