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

export function create(
	config: nconf.Provider,
	tenantService: ITenantService,
	restTenantThrottlers: Map<string, IThrottler>,
	restClusterThrottlers: Map<string, IThrottler>,
	cache?: ICache,
	asyncLocalStorage?: AsyncLocalStorage<string>,
): IRoutes {
	return {
		git: {
			blobs: blobs.create(
				config,
				tenantService,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
			),
			commits: commits.create(
				config,
				tenantService,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
			),
			refs: refs.create(
				config,
				tenantService,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
			),
			tags: tags.create(
				config,
				tenantService,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
			),
			trees: trees.create(
				config,
				tenantService,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
			),
		},
		repository: {
			commits: repositoryCommits.create(
				config,
				tenantService,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
			),
			contents: contents.create(
				config,
				tenantService,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
			),
			headers: headers.create(
				config,
				tenantService,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
			),
		},
		summaries: summaries.create(
			config,
			tenantService,
			restTenantThrottlers,
			restClusterThrottlers,
			cache,
			asyncLocalStorage,
		),
	};
}
