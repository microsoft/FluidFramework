/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as git from "@fluidframework/gitresources";
import type {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
	IDocumentManager,
	IDenyList,
} from "@fluidframework/server-services-core";
import {
	denyListMiddleware,
	type IThrottleMiddlewareOptions,
	throttle,
} from "@fluidframework/server-services-utils";
import {
	containsPathTraversal,
	validateRequestParams,
} from "@fluidframework/server-services-shared";
import { Router } from "express";
import type * as nconf from "nconf";
import winston from "winston";
import type { ICache, ITenantService, ISimplifiedCustomDataRetriever } from "../../services";
import * as utils from "../utils";
import { Constants } from "../../utils";
import { NetworkError } from "@fluidframework/server-services-client";
import { ScopeType } from "@fluidframework/protocol-definitions";

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

	const maxTokenLifetimeSec = config.get("maxTokenLifetimeSec");

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => req.params.tenantId,
		throttleIdSuffix: Constants.historianRestThrottleIdSuffix,
	};
	const restTenantGeneralThrottler = restTenantThrottlers.get(
		Constants.generalRestCallThrottleIdPrefix,
	);

	async function getCommits(
		tenantId: string,
		authorization: string | undefined,
		sha: string,
		count: number = 1,
	): Promise<git.ICommitDetails[]> {
		if (sha === undefined) {
			throw new NetworkError(400, "Missing required parameter 'sha'");
		}
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager,
			cache,
			ephemeralDocumentTTLSec,
		});
		return service.getCommits(sha, count);
	}

	router.get(
		"/repos/:ignored?/:tenantId/commits",
		validateRequestParams("tenantId"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker, [ScopeType.DocRead], maxTokenLifetimeSec),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const sha = utils.queryParamToString(request.query.sha);
			if (sha === undefined) {
				utils.handleResponse(
					Promise.reject(new NetworkError(400, "Missing required parameter 'sha'")),
					response,
					false,
				);
				return;
			}
			if (containsPathTraversal(sha)) {
				utils.handleResponse(
					Promise.reject(new NetworkError(400, "Invalid sha")),
					response,
					false,
				);
				return;
			}
			const commitsP = getCommits(
				request.params.tenantId,
				request.get("Authorization"),
				sha,
				utils.queryParamToNumber(request.query.count),
			);

			utils.handleResponse(commitsP, response, false);
		},
	);

	return router;
}
