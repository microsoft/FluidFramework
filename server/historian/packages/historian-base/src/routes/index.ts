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
import { ICache, IDenyList, ITenantService } from "../services";
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
	denyList?: IDenyList,
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
				denyList,
			),
			commits: commits.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
				denyList,
			),
			refs: refs.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
				denyList,
			),
			tags: tags.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
				denyList,
			),
			trees: trees.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
				denyList,
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
				denyList,
			),
			contents: contents.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
				denyList,
			),
			headers: headers.create(
				config,
				tenantService,
				storageNameRetriever,
				restTenantThrottlers,
				cache,
				asyncLocalStorage,
				revokedTokenChecker,
				denyList,
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
			denyList,
		),
	};
}
