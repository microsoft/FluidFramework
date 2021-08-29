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
import * as summaries from "./summaries";
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
    summaries: Router;
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function create(
    config: nconf.Provider,
    tenantService: ITenantService,
    throttler: IThrottler,
    cache?: ICache,
    asyncLocalStorage?: AsyncLocalStorage<string>): IRoutes {
    return {
        git: {
            blobs: blobs.create(config, tenantService, throttler, cache, asyncLocalStorage),
            commits: commits.create(config, tenantService, throttler, cache, asyncLocalStorage),
            refs: refs.create(config, tenantService, throttler, cache, asyncLocalStorage),
            tags: tags.create(config, tenantService, throttler, cache, asyncLocalStorage),
            trees: trees.create(config, tenantService, throttler, cache, asyncLocalStorage),
        },
        repository: {
            commits: repositoryCommits.create(config, tenantService, throttler, cache, asyncLocalStorage),
            contents: contents.create(config, tenantService, throttler, cache, asyncLocalStorage),
            headers: headers.create(config, tenantService, throttler, cache, asyncLocalStorage),
        },
        summaries: summaries.create(config, tenantService, throttler, cache, asyncLocalStorage),
    };
}
