/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as git from "@fluidframework/gitresources";
import { IThrottler, ITokenRevocationManager } from "@fluidframework/server-services-core";
import {
	IThrottleMiddlewareOptions,
	throttle,
	getParam,
} from "@fluidframework/server-services-utils";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, ITenantService } from "../../services";
import * as utils from "../utils";
import { Constants } from "../../utils";

export function create(
	config: nconf.Provider,
	tenantService: ITenantService,
	restTenantThrottlers: Map<string, IThrottler>,
	cache?: ICache,
	asyncLocalStorage?: AsyncLocalStorage<string>,
	tokenRevocationManager?: ITokenRevocationManager,
): Router {
	const router: Router = Router();

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
		throttleIdSuffix: Constants.historianRestThrottleIdSuffix,
	};
	const restTenantGeneralThrottler = restTenantThrottlers.get(
		Constants.generalRestCallThrottleIdPrefix,
	);

	async function createTree(
		tenantId: string,
		authorization: string,
		params: git.ICreateTreeParams,
	): Promise<git.ITree> {
		const service = await utils.createGitService(
			config,
			tenantId,
			authorization,
			tenantService,
			cache,
			asyncLocalStorage,
		);
		return service.createTree(params);
	}

	async function getTree(
		tenantId: string,
		authorization: string,
		sha: string,
		recursive: boolean,
		useCache: boolean,
	): Promise<git.ITree> {
		const service = await utils.createGitService(
			config,
			tenantId,
			authorization,
			tenantService,
			cache,
			asyncLocalStorage,
		);
		return service.getTree(sha, recursive, useCache);
	}

	router.post(
		"/repos/:ignored?/:tenantId/git/trees",
		utils.validateRequestParams("tenantId"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyTokenNotRevoked(tokenRevocationManager),
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
		utils.validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyTokenNotRevoked(tokenRevocationManager),
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
