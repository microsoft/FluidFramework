/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as git from "@fluidframework/gitresources";
import type {
	ICreateRefParamsExternal,
	IPatchRefParamsExternal,
} from "@fluidframework/server-services-client";
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
import { validateRequestParams } from "@fluidframework/server-services-shared";
import { Router } from "express";
import type * as nconf from "nconf";
import winston from "winston";
import type { ICache, ITenantService, ISimplifiedCustomDataRetriever } from "../../services";
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

	async function getRefs(
		tenantId: string,
		authorization: string | undefined,
	): Promise<git.IRef[]> {
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
		return service.getRefs();
	}

	async function getRef(
		tenantId: string,
		authorization: string | undefined,
		ref: string,
	): Promise<git.IRef> {
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
		return service.getRef(ref);
	}

	async function createRef(
		tenantId: string,
		authorization: string | undefined,
		params: ICreateRefParamsExternal,
	): Promise<git.IRef> {
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
		return service.createRef(params);
	}

	async function updateRef(
		tenantId: string,
		authorization: string | undefined,
		ref: string,
		params: IPatchRefParamsExternal,
	): Promise<git.IRef> {
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
		return service.updateRef(ref, params);
	}

	async function deleteRef(
		tenantId: string,
		authorization: string | undefined,
		ref: string,
	): Promise<void> {
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
		return service.deleteRef(ref);
	}

	router.get(
		"/repos/:ignored?/:tenantId/git/refs",
		validateRequestParams("tenantId"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker, [ScopeType.DocRead], maxTokenLifetimeSec),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const refsP = getRefs(request.params.tenantId, request.get("Authorization"));
			utils.handleResponse(refsP, response, false);
		},
	);

	router.get(
		"/repos/:ignored?/:tenantId/git/refs/*",
		validateRequestParams("tenantId", 0),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker, [ScopeType.DocRead], maxTokenLifetimeSec),
		(request, response, next) => {
			const refP = getRef(
				request.params.tenantId,
				request.get("Authorization"),
				request.params[0],
			);
			utils.handleResponse(refP, response, false);
		},
	);

	router.post(
		"/repos/:ignored?/:tenantId/git/refs",
		validateRequestParams("tenantId"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(
			revokedTokenChecker,
			[ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
			maxTokenLifetimeSec,
		),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const refP = createRef(
				request.params.tenantId,
				request.get("Authorization"),
				request.body,
			);
			utils.handleResponse(refP, response, false, undefined, 201);
		},
	);

	router.patch(
		"/repos/:ignored?/:tenantId/git/refs/*",
		validateRequestParams("tenantId", 0),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(
			revokedTokenChecker,
			[ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
			maxTokenLifetimeSec,
		),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const refP = updateRef(
				request.params.tenantId,
				request.get("Authorization"),
				request.params[0],
				request.body,
			);
			utils.handleResponse(refP, response, false);
		},
	);

	router.delete(
		"/repos/:ignored?/:tenantId/git/refs/*",
		validateRequestParams("tenantId", 0),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(
			revokedTokenChecker,
			[ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
			maxTokenLifetimeSec,
		),
		// Skip documentDenyListCheck, as it is not needed for delete operations
		denyListMiddleware(denyList, true /* skipDocumentDenyListCheck */),
		(request, response, next) => {
			const refP = deleteRef(
				request.params.tenantId,
				request.get("Authorization"),
				request.params[0],
			);
			utils.handleResponse(refP, response, false, undefined, 204);
		},
	);

	return router;
}
