import { Router } from "express";
import * as nconf from "nconf";
import { ICache } from "../services";
import * as blobs from "./git/blobs";
import * as commits from "./git/commits";
import * as refs from "./git/refs";
import * as repos from "./git/repos";
import * as tags from "./git/tags";
import * as trees from "./git/trees";
import * as repositoryCommits from "./repository/commits";
import * as contents from "./repository/contents";
import * as headers from "./repository/headers";

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
        headers: Router;
    };
}

export function create(
    store: nconf.Provider,
    cache: ICache): IRoutes {

    return {
        git: {
            blobs: blobs.create(store, cache),
            commits: commits.create(store, cache),
            refs: refs.create(store, cache),
            repos: repos.create(store, cache),
            tags: tags.create(store, cache),
            trees: trees.create(store, cache),
        },
        repository: {
            commits: repositoryCommits.create(store, cache),
            contents: contents.create(store, cache),
            headers: headers.create(store, cache),
        },
    };
}
