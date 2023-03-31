/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as git from "@fluidframework/gitresources";
import { IThrottler } from "@fluidframework/server-services-core";
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
): Router {
	const router: Router = Router();

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
		throttleIdSuffix: Constants.historianRestThrottleIdSuffix,
	};
	const restTenantGeneralThrottler = restTenantThrottlers.get(
		Constants.generalRestCallThrottleIdPrefix,
	);

	async function createBlob(
		tenantId: string,
		authorization: string,
		body: git.ICreateBlobParams,
	): Promise<git.ICreateBlobResponse> {
		const service = await utils.createGitService(
			config,
			tenantId,
			authorization,
			tenantService,
			cache,
			asyncLocalStorage,
		);
		return service.createBlob(body);
	}

	async function getBlob(
		tenantId: string,
		authorization: string,
		sha: string,
		useCache: boolean,
	): Promise<git.IBlob> {
		const service = await utils.createGitService(
			config,
			tenantId,
			authorization,
			tenantService,
			cache,
			asyncLocalStorage,
		);
		return service.getBlob(sha, useCache);
	}

	/**
	 * Historian https ping endpoint for availability monitoring system
	 */
	router.get(
		"/repos/ping",
		throttle(restTenantGeneralThrottler, winston, {
			...tenantThrottleOptions,
			throttleIdPrefix: "ping",
		}),
		async (request, response) => {
			response.sendStatus(200);
		},
	);

	router.post(
		"/repos/:ignored?/:tenantId/git/blobs",
		utils.validateRequestParams("tenantId"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		(request, response, next) => {
			const blobP = createBlob(
				request.params.tenantId,
				request.get("Authorization"),
				request.body,
			);
			utils.handleResponse(blobP, response, false, 201);
		},
	);

	/**
	 * Retrieves the given blob from the repository
	 */
	router.get(
		"/repos/:ignored?/:tenantId/git/blobs/:sha",
		utils.validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);
			const blobP = getBlob(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);
			utils.handleResponse(blobP, response, useCache);
		},
	);

	/**
	 * Retrieves the given blob as an image
	 */
	router.get(
		"/repos/:ignored?/:tenantId/git/blobs/raw/:sha",
		utils.validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);

			const blobP = getBlob(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);

			blobP.then(
				(blob) => {
					if (useCache) {
						response.setHeader("Cache-Control", "public, max-age=31536000");
					}
					response
						.status(200)
						.write(Buffer.from(blob.content, "base64"), () => response.end());
				},
				(error) => {
					response.status(error?.code ?? 400).json(error?.message ?? error);
				},
			);
		},
	);

	return router;
}
