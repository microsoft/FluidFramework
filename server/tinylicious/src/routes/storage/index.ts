/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import blobs from "./git/blobs";
import commits from "./git/commits";
import refs from "./git/refs";
import tags from "./git/tags";
import trees from "./git/trees";
import repositoryCommits from "./repository/commits";
import contents from "./repository/contents";
import headers from "./repository/headers";

export interface IRoutes {
    git: {
        blobs: Router;
        commits: Router;
        refs: Router;
        tags: Router;
        trees: Router;
    };
    repository: {
        commits: Router;
        contents: Router;
        headers: Router;
    };
}

export function create(store: nconf.Provider): Router {
    const apiRoutes = {
        git: {
            blobs: blobs.create(store),
            commits: commits.create(store),
            refs: refs.create(store),
            tags: tags.create(store),
            trees: trees.create(store),
        },
        repository: {
            commits: repositoryCommits.create(store),
            contents: contents.create(store),
            headers: headers.create(store),
        },
    };

    const router: Router = Router();
    router.use(apiRoutes.git.blobs);
    router.use(apiRoutes.git.refs);
    router.use(apiRoutes.git.tags);
    router.use(apiRoutes.git.trees);
    router.use(apiRoutes.git.commits);
    router.use(apiRoutes.repository.commits);
    router.use(apiRoutes.repository.contents);
    router.use(apiRoutes.repository.headers);

    return router;
}
