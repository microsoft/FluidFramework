/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
	IDocumentManager,
	type IDenyList,
} from "@fluidframework/server-services-core";
import {
	denyListMiddleware,
	IThrottleMiddlewareOptions,
	throttle,
} from "@fluidframework/server-services-utils";
import { validateRequestParams } from "@fluidframework/server-services-shared";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, ITenantService, ISimplifiedCustomDataRetriever } from "../../services";
import * as utils from "../utils";
import { Constants } from "../../utils";

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
): Router {
	const router: Router = Router();

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => req.params.tenantId,
		throttleIdSuffix: Constants.historianRestThrottleIdSuffix,
	};
	const restTenantGeneralThrottler = restTenantThrottlers.get(
		Constants.generalRestCallThrottleIdPrefix,
	);

	async function createTree(
		tenantId: string,
		authorization: string | undefined,
		params: git.ICreateTreeParams,
	): Promise<git.ITree> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager,
			cache,
			ephemeralDocumentTTLSec,
			simplifiedCustomDataRetriever,
		});
		return service.createTree(params);
	}

	async function getTree(
		tenantId: string,
		authorization: string | undefined,
		sha: string,
		recursive: boolean,
		useCache: boolean,
	): Promise<git.ITree> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager,
			cache,
		});
		return service.getTree(sha, recursive, useCache);
	}

	router.post(
		"/repos/:ignored?/:tenantId/git/trees",
		validateRequestParams("tenantId"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const treeP = createTree(
				request.params.tenantId,
				request.get("Authorization"),
				request.body,
			);
			utils.handleResponse(treeP, response, false, undefined, 201);
		},
	);

	router.get(
		"/repos/:ignored?/:tenantId/git/trees/:sha",
		validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);
			const treeP = getTree(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				request.query.recursive === "1",
				useCache,
			);
			utils.handleResponse(treeP, response, useCache);
		},
	);

	return router;
}
