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
import { ICache, IDenyList, ITenantService, ISimplifiedCustomDataRetriever } from "../../services";
/* eslint-disable import/no-internal-modules */
import * as refs from "./git/refs";
import * as repositoryCommits from "./repository/commits";
/* eslint-enable import/no-internal-modules */
import * as summaries from "./summaries";
import { CommonRouteParams } from "../utils";

export interface IRoutes {
	git: {
		refs: Router;
	};
	repository: {
		commits: Router;
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
	simplifiedCustomDataRetriever?: ISimplifiedCustomDataRetriever,
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
		simplifiedCustomDataRetriever,
	];
	return {
		git: {
			refs: refs.create(...commonRouteParams),
		},
		repository: {
			commits: repositoryCommits.create(...commonRouteParams),
		},
		summaries: summaries.create(...commonRouteParams),
	};
}
