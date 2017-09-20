import { Router } from "express";
import * as git from "gitresources";
import * as nconf from "nconf";
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
    historianService: git.IHistorian): IRoutes {

    return {
        git: {
            blobs: blobs.create(store, historianService),
            commits: commits.create(store, historianService),
            refs: refs.create(store, historianService),
            repos: repos.create(store, historianService),
            tags: tags.create(store, historianService),
            trees: trees.create(store, historianService),
        },
        repository: {
            commits: repositoryCommits.create(store, historianService),
            contents: contents.create(store, historianService),
            headers: headers.create(store, historianService),
        },
    };
}
