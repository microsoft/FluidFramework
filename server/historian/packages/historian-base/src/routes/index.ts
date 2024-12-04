/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
	IDocumentManager,
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
import { CommonRouteParams } from "./utils";
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
	storageNameRetriever: IStorageNameRetriever | undefined,
	restTenantThrottlers: Map<string, IThrottler>,
	restClusterThrottlers: Map<string, IThrottler>,
	documentManager: IDocumentManager,
	cache?: ICache,
	revokedTokenChecker?: IRevokedTokenChecker,
	denyList?: IDenyList,
	ephemeralDocumentTTLSec?: number,
): IRoutes {
	const commonRouteParams: CommonRouteParams = [
		config,
		tenantService,
		storageNameRetriever,
		restTenantThrottlers,
		restClusterThrottlers,
		documentManager,
		cache,
		revokedTokenChecker,
		denyList,
		ephemeralDocumentTTLSec,
	];
	return {
		git: {
			blobs: blobs.create(...commonRouteParams),
			commits: commits.create(...commonRouteParams),
			refs: refs.create(...commonRouteParams),
			tags: tags.create(...commonRouteParams),
			trees: trees.create(...commonRouteParams),
		},
		repository: {
			commits: repositoryCommits.create(...commonRouteParams),
			contents: contents.create(...commonRouteParams),
			headers: headers.create(...commonRouteParams),
		},
		summaries: summaries.create(...commonRouteParams),
	};
}
