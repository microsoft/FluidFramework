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
} from "@fluidframework/server-services-core";
import { IThrottleMiddlewareOptions, throttle } from "@fluidframework/server-services-utils";
import {
	containsPathTraversal,
	validateRequestParams,
} from "@fluidframework/server-services-shared";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, IDenyList, ITenantService } from "../../services";
import * as utils from "../utils";
import { Constants } from "../../utils";
import { NetworkError } from "@fluidframework/server-services-client";

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
): Router {
	const router: Router = Router();

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
			denyList,
			ephemeralDocumentTTLSec,
		});
		return service.getCommits(sha, count);
	}

	router.get(
		"/repos/:ignored?/:tenantId/commits",
		validateRequestParams("tenantId"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker),
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
