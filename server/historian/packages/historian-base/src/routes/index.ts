/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { IThrottler } from "@fluidframework/server-services-core";
import { Router } from "express";
import * as nconf from "nconf";
import { ICache, ITenantService } from "../services";
/* eslint-disable import/no-internal-modules */
import * as blobs from "./git/blobs";
import * as commits from "./git/commits";
import * as refs from "./git/refs";
import * as tags from "./git/tags";
import * as trees from "./git/trees";
import * as repositoryCommits from "./repository/commits";
import * as contents from "./repository/contents";
import * as headers from "./repository/headers";
/* eslint-enable import/no-internal-modules */

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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function create(
    store: nconf.Provider,
    tenantService: ITenantService,
    cache: ICache,
    throttler: IThrottler,
    asyncLocalStorage?: AsyncLocalStorage<string>): IRoutes {
    return {
        git: {
            blobs: blobs.create(store, tenantService, cache, throttler, asyncLocalStorage),
            commits: commits.create(store, tenantService, cache, throttler, asyncLocalStorage),
            refs: refs.create(store, tenantService, cache, throttler, asyncLocalStorage),
            tags: tags.create(store, tenantService, cache, throttler, asyncLocalStorage),
            trees: trees.create(store, tenantService, cache, throttler, asyncLocalStorage),
        },
        repository: {
            commits: repositoryCommits.create(store, tenantService, cache, throttler, asyncLocalStorage),
            contents: contents.create(store, tenantService, cache, throttler, asyncLocalStorage),
            headers: headers.create(store, tenantService, cache, throttler, asyncLocalStorage),
        },
    };
}
