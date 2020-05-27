/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import * as nconf from "nconf";
import * as utils from "../utils";
/* eslint-disable import/no-internal-modules */
import * as blobs from "./git/blobs";
import * as commits from "./git/commits";
import * as refs from "./git/refs";
import * as repos from "./git/repos";
import * as tags from "./git/tags";
import * as trees from "./git/trees";
import * as repositoryCommits from "./repository/commits";
import * as contents from "./repository/contents";
/* eslint-enable import/no-internal-modules */

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
