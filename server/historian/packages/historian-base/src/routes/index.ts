/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
} from "@fluidframework/server-services-core";
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
	storageNameRetriever: IStorageNameRetriever,
	restTenantThrottlers: Map<string, IThrottler>,
	restClusterThrottlers: Map<string, IThrottler>,
	cache?: ICache,
	asyncLocalStorage?: AsyncLocalStorage<string>,
	revokedTokenChecker?: IRevokedTokenChecker,
): IRoutes {
	return {
		git: {
			blobs: blobs.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
			),
			commits: commits.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
			),
			refs: refs.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
			),
			tags: tags.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
			),
			trees: trees.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
			),
		},
		repository: {
			commits: repositoryCommits.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
			),
			contents: contents.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
			),
			headers: headers.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
			),
		},
		summaries: summaries.create(
			config,
			tenantService,
			storageNameRetriever,
			restTenantThrottlers,
			restClusterThrottlers,
			cache,
			asyncLocalStorage,
			revokedTokenChecker,
		),
	};
}
