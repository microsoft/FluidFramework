/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICache,
	IDeltaService,
	ITenantManager,
	IThrottler,
	ITokenRevocationManager,
} from "@fluidframework/server-services-core";
import {
	verifyStorageToken,
	throttle,
	IThrottleMiddlewareOptions,
	getParam,
	getBooleanFromConfig,
} from "@fluidframework/server-services-utils";
import { validateRequestParams, handleResponse } from "@fluidframework/server-services";
import { Router } from "express";
import { Provider } from "nconf";
import winston from "winston";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { Constants } from "../../../utils";

export function create(
	config: Provider,
	tenantManager: ITenantManager,
	deltaService: IDeltaService,
	appTenants: IAlfredTenant[],
	tenantThrottlers: Map<string, IThrottler>,
	clusterThrottlers: Map<string, IThrottler>,
	jwtTokenCache?: ICache,
	tokenManager?: ITokenRevocationManager,
): Router {
	const deltasCollectionName = config.get("mongo:collectionNames:deltas");
	const rawDeltasCollectionName = config.get("mongo:collectionNames:rawdeltas");
	const router: Router = Router();

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId") || appTenants[0].id,
		throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
	};
	const generalTenantThrottler = tenantThrottlers.get(Constants.generalRestCallThrottleIdPrefix);

	const getDeltasTenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId") || appTenants[0].id,
		throttleIdSuffix: Constants.getDeltasThrottleIdPrefix,
	};

	const getDeltasClusterThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: Constants.getDeltasThrottleIdPrefix,
		throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
	};

	// Jwt token cache
	const enableJwtTokenCache: boolean = getBooleanFromConfig(
		"alfred:jwtTokenCache:enable",
		config,
	);

	const defaultTokenValidationOptions = {
		requireDocumentId: true,
		ensureSingleUseToken: false,
		singleUseTokenCache: undefined,
		enableTokenCache: enableJwtTokenCache,
		tokenCache: jwtTokenCache,
	};

	function stringToSequenceNumber(value: any): number {
		if (typeof value !== "string") {
			return undefined;
		}
		const parsedValue = parseInt(value, 10);
		return isNaN(parsedValue) ? undefined : parsedValue;
	}

	/**
	 * New api that fetches ops from summary and storage.
	 * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
	 */
	router.get(
		["/v1/:tenantId/:id", "/:tenantId/:id/v1"],
		validateRequestParams("tenantId", "id"),
		throttle(generalTenantThrottler, winston, tenantThrottleOptions),
		verifyStorageToken(tenantManager, config, tokenManager, defaultTokenValidationOptions),
		(request, response, next) => {
			const from = stringToSequenceNumber(request.query.from);
			const to = stringToSequenceNumber(request.query.to);
			const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

			// Query for the deltas and return a filtered version of just the operations field
			const deltasP = deltaService.getDeltasFromSummaryAndStorage(
				deltasCollectionName,
				tenantId,
				getParam(request.params, "id"),
				from,
				to,
			);

			handleResponse(deltasP, response, undefined, 500);
		},
	);

	/**
	 * Retrieves raw (unsequenced) deltas for the given document.
	 */
	router.get(
		"/raw/:tenantId/:id",
		validateRequestParams("tenantId", "id"),
		throttle(generalTenantThrottler, winston, tenantThrottleOptions),
		verifyStorageToken(tenantManager, config, tokenManager, defaultTokenValidationOptions),
		(request, response, next) => {
			const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

			// Query for the raw deltas (no from/to since we want all of them)
			const deltasP = deltaService.getDeltas(
				rawDeltasCollectionName,
				tenantId,
				getParam(request.params, "id"),
			);

			handleResponse(deltasP, response, undefined, 500);
		},
	);

	/**
	 * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
	 */
	router.get(
		"/:tenantId/:id",
		validateRequestParams("tenantId", "id"),
		throttle(
			clusterThrottlers.get(Constants.getDeltasThrottleIdPrefix),
			winston,
			getDeltasClusterThrottleOptions,
		),
		throttle(
			tenantThrottlers.get(Constants.getDeltasThrottleIdPrefix),
			winston,
			getDeltasTenantThrottleOptions,
		),
		verifyStorageToken(tenantManager, config, tokenManager, defaultTokenValidationOptions),
		(request, response, next) => {
			const from = stringToSequenceNumber(request.query.from);
			const to = stringToSequenceNumber(request.query.to);
			const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

			// Query for the deltas and return a filtered version of just the operations field
			const deltasP = deltaService.getDeltas(
				deltasCollectionName,
				tenantId,
				getParam(request.params, "id"),
				from,
				to,
			);

			handleResponse(deltasP, response, undefined, 500);
		},
	);

	return router;
}
