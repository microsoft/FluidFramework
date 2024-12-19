/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IHeader } from "@fluidframework/gitresources";
import {
	IStorageNameRetriever,
	ISimplifiedCustomDataRetriever,
	IThrottler,
	IRevokedTokenChecker,
	IDocumentManager,
} from "@fluidframework/server-services-core";
import { IThrottleMiddlewareOptions, throttle } from "@fluidframework/server-services-utils";
import { validateRequestParams } from "@fluidframework/server-services-shared";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, IDenyList, ITenantService } from "../../services";
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

	async function getHeader(
		tenantId: string,
		authorization: string | undefined,
		sha: string,
		useCache: boolean,
	): Promise<IHeader> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager,
			cache,
			denyList,
			ephemeralDocumentTTLSec,
		});
		return service.getHeader(sha, useCache);
	}

	async function getTree(
		tenantId: string,
		authorization: string | undefined,
		sha: string,
		useCache: boolean,
	): Promise<any> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager,
			cache,
			denyList,
			ephemeralDocumentTTLSec,
		});
		return service.getFullTree(sha, useCache);
	}

	router.get(
		"/repos/:ignored?/:tenantId/headers/:sha",
		validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);
			const headerP = getHeader(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);
			utils.handleResponse(headerP, response, useCache);
		},
	);

	router.get(
		"/repos/:ignored?/:tenantId/tree/:sha",
		validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);
			const headerP = getTree(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);
			utils.handleResponse(headerP, response, useCache);
		},
	);

	return router;
}
