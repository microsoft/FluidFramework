/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

	async function getContent(
		tenantId: string,
		authorization: string | undefined,
		path: string,
		ref: string | undefined,
	): Promise<any> {
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
		return service.getContent(path, ref);
	}

	router.get(
		"/repos/:ignored?/:tenantId/contents/*",
		validateRequestParams("tenantId", 0),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker, [ScopeType.DocRead], maxTokenLifetimeSec),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const contentP = getContent(
				request.params.tenantId,
				request.get("Authorization"),
				request.params[0],
				utils.queryParamToString(request.query.ref),
			);
			utils.handleResponse(contentP, response, false);
		},
	);

	return router;
}
