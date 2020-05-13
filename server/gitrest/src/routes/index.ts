/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import utils from "../utils";
import blobs from "./git/blobs";
import commits from "./git/commits";
import refs from "./git/refs";
import repos from "./git/repos";
import tags from "./git/tags";
import trees from "./git/trees";
import repositoryCommits from "./repository/commits";
import contents from "./repository/contents";

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

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): IRoutes {
    return {
        git: {
            blobs: blobs.create(store, repoManager),
            commits: commits.create(store, repoManager),
            refs: refs.create(store, repoManager),
            repos: repos.create(store, repoManager),
            tags: tags.create(store, repoManager),
            trees: trees.create(store, repoManager),
        },
        repository: {
            commits: repositoryCommits.create(store, repoManager),
            contents: contents.create(store, repoManager),
        },
    };
}
