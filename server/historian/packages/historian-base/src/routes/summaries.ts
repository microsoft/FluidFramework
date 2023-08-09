/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import {
	IWholeFlatSummary,
	IWholeSummaryPayload,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
} from "@fluidframework/server-services-core";
import {
	IThrottleMiddlewareOptions,
	throttle,
	getParam,
} from "@fluidframework/server-services-utils";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { ICache, IDenyList, ITenantService } from "../services";
import { parseToken, Constants } from "../utils";
import * as utils from "./utils";

export function create(
	config: nconf.Provider,
	tenantService: ITenantService,
	storageNameRetriever: IStorageNameRetriever,
	restTenantThrottlers: Map<string, IThrottler>,
	restClusterThrottlers: Map<string, IThrottler>,
	cache?: ICache,
	asyncLocalStorage?: AsyncLocalStorage<string>,
	revokedTokenChecker?: IRevokedTokenChecker,
	denyList?: IDenyList,
): Router {
	const router: Router = Router();
	const ignoreIsEphemeralFlag: boolean = config.get("ignoreEphemeralFlag") ?? true;

	const tenantGeneralThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
		throttleIdSuffix: Constants.historianRestThrottleIdSuffix,
	};
	const restTenantGeneralThrottler = restTenantThrottlers.get(
		Constants.generalRestCallThrottleIdPrefix,
	);

	// Throttling logic for creating summary to provide per-tenant rate-limiting at the HTTP route level
	const createSummaryPerTenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
		throttleIdSuffix: Constants.createSummaryThrottleIdPrefix,
	};
	const restTenantCreateSummaryThrottler = restTenantThrottlers.get(
		Constants.createSummaryThrottleIdPrefix,
	);

	// Throttling logic for getting summary to provide per-tenant rate-limiting at the HTTP route level
	const getSummaryPerTenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
		throttleIdSuffix: Constants.getSummaryThrottleIdPrefix,
	};
	const restTenantGetSummaryThrottler = restTenantThrottlers.get(
		Constants.getSummaryThrottleIdPrefix,
	);

	// Throttling logic for creating summary to provide per-cluster rate-limiting at the HTTP route level
	const createSummaryPerClusterThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: Constants.createSummaryThrottleIdPrefix,
		throttleIdSuffix: Constants.historianRestThrottleIdSuffix,
	};
	const restClusterCreateSummaryThrottler = restClusterThrottlers.get(
		Constants.createSummaryThrottleIdPrefix,
	);

	// Throttling logic for getting summary to provide per-cluster rate-limiting at the HTTP route level
	const getSummaryPerClusterThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: Constants.getSummaryThrottleIdPrefix,
		throttleIdSuffix: Constants.historianRestThrottleIdSuffix,
	};
	const restClusterGetSummaryThrottler = restClusterThrottlers.get(
		Constants.getSummaryThrottleIdPrefix,
	);

	async function getSummary(
		tenantId: string,
		authorization: string,
		sha: string,
		useCache: boolean,
	): Promise<IWholeFlatSummary> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			cache,
			asyncLocalStorage,
			denyList,
		});
		return service.getSummary(sha, useCache);
	}

	async function createSummary(
		tenantId: string,
		authorization: string,
		params: IWholeSummaryPayload,
		initial?: boolean,
		storageName?: string,
		isEphemeralContainer?: boolean,
		ignoreEphemeralFlag?: boolean,
	): Promise<IWriteSummaryResponse> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			cache,
			asyncLocalStorage,
			initialUpload: initial,
			storageName,
			isEphemeralContainer,
			ignoreEphemeralFlag,
			denyList,
		});
		return service.createSummary(params, initial);
	}

	async function deleteSummary(
		tenantId: string,
		authorization: string,
		softDelete: boolean,
	): Promise<boolean[]> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			cache,
			asyncLocalStorage,
			allowDisabledTenant: true,
			denyList,
		});
		const deletionPs = [service.deleteSummary(softDelete)];
		if (!softDelete) {
			deletionPs.push(
				tenantService.deleteFromCache(tenantId, parseToken(tenantId, authorization)),
			);
		}
		return Promise.all(deletionPs);
	}

	router.get(
		"/repos/:ignored?/:tenantId/git/summaries/:sha",
		throttle(restClusterGetSummaryThrottler, winston, getSummaryPerClusterThrottleOptions),
		throttle(restTenantGetSummaryThrottler, winston, getSummaryPerTenantThrottleOptions),
		utils.verifyTokenNotRevoked(revokedTokenChecker),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);
			const summaryP = getSummary(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);

			utils.handleResponse(
				summaryP,
				response,
				// Browser caching for summary data should be disabled for now.
				false,
			);
		},
	);

	router.post(
		"/repos/:ignored?/:tenantId/git/summaries",
		throttle(
			restClusterCreateSummaryThrottler,
			winston,
			createSummaryPerClusterThrottleOptions,
		),
		throttle(restTenantCreateSummaryThrottler, winston, createSummaryPerTenantThrottleOptions),
		utils.verifyTokenNotRevoked(revokedTokenChecker),
		(request, response, next) => {
			// request.query type is { [string]: string } but it's actually { [string]: any }
			// Account for possibilities of undefined, boolean, or string types. A number will be false.
			const initial: boolean | undefined =
				typeof request.query.initial === "undefined"
					? undefined
					: typeof request.query.initial === "boolean"
					? request.query.initial
					: request.query.initial === "true";

			const isEphemeralFromRequest = request.get(Constants.IsEphemeralContainer);

			// We treat these cases where we did not get the header as non-ephemeral containers
			const isEphemeral: boolean =
				isEphemeralFromRequest === undefined ? false : isEphemeralFromRequest === "true";

			// Only the initial post summary has a valid IsEphemeralContainer flag which we store in cache
			// For the other cases, we set the flag to undefined so that it can fetched from cache/storage
			const isEphemeralContainer: boolean | undefined = !ignoreIsEphemeralFlag
				? initial
					? isEphemeral
					: undefined
				: false;

			const lumberjackProperties = {
				[BaseTelemetryProperties.tenantId]: request.params.tenantId,
				[Constants.IsEphemeralContainer]: isEphemeralContainer,
				[Constants.isInitialSummary]: initial,
			};
			Lumberjack.info(`Calling createSummary`, lumberjackProperties);

			const summaryP = createSummary(
				request.params.tenantId,
				request.get("Authorization"),
				request.body,
				initial,
				request.get("StorageName"),
				isEphemeralContainer,
				ignoreIsEphemeralFlag,
			);

			utils.handleResponse(summaryP, response, false, undefined, 201);
		},
	);

	router.delete(
		"/repos/:ignored?/:tenantId/git/summaries",
		throttle(restTenantGeneralThrottler, winston, tenantGeneralThrottleOptions),
		utils.verifyTokenNotRevoked(revokedTokenChecker),
		(request, response, next) => {
			const softDelete = request.get("Soft-Delete")?.toLowerCase() === "true";
			const summaryP = deleteSummary(
				request.params.tenantId,
				request.get("Authorization"),
				softDelete,
			);

			utils.handleResponse(summaryP, response, false);
		},
	);

	return router;
}
