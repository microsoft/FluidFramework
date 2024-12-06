/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import {
	ICreateRefParamsExternal,
	IPatchRefParamsExternal,
} from "@fluidframework/server-services-client";
import {
	IStorageNameRetriever,
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
): Router {
	const router: Router = Router();

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
			denyList,
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
			denyList,
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
			denyList,
			ephemeralDocumentTTLSec,
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
			denyList,
			ephemeralDocumentTTLSec,
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
			denyList,
			ephemeralDocumentTTLSec,
		});
		return service.deleteRef(ref);
	}

	router.get(
		"/repos/:ignored?/:tenantId/git/refs",
		validateRequestParams("tenantId"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker),
		(request, response, next) => {
			const refsP = getRefs(request.params.tenantId, request.get("Authorization"));
			utils.handleResponse(refsP, response, false);
		},
	);

	router.get(
		"/repos/:ignored?/:tenantId/git/refs/*",
		validateRequestParams("tenantId", 0),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker),
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
		utils.verifyToken(revokedTokenChecker),
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
		utils.verifyToken(revokedTokenChecker),
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
		utils.verifyToken(revokedTokenChecker),
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
