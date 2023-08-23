/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as git from "@fluidframework/gitresources";
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
import { ICache, IDenyList, ITenantService } from "../../services";
import * as utils from "../utils";
import { Constants } from "../../utils";

export function create(
	config: nconf.Provider,
	tenantService: ITenantService,
	storageNameRetriever: IStorageNameRetriever,
	restTenantThrottlers: Map<string, IThrottler>,
	cache?: ICache,
	asyncLocalStorage?: AsyncLocalStorage<string>,
	revokedTokenChecker?: IRevokedTokenChecker,
	denyList?: IDenyList,
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
		return service.createBlob(body);
	}

	async function getBlob(
		tenantId: string,
		authorization: string,
		sha: string,
		useCache: boolean,
	): Promise<git.IBlob> {
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
		utils.verifyTokenNotRevoked(revokedTokenChecker),
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
		utils.verifyTokenNotRevoked(revokedTokenChecker),
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
		utils.verifyTokenNotRevoked(revokedTokenChecker),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);

			const blobP = getBlob(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);

			blobP
				.then((blob) => {
					if (useCache) {
						response.setHeader("Cache-Control", "public, max-age=31536000");
					}
					// Make sure the browser will expose specific headers for performance analysis.
					response.setHeader(
						"Access-Control-Expose-Headers",
						"Content-Encoding, Content-Length, Content-Type",
					);
					// In order to report W3C timings, Time-Allow-Origin needs to be set.
					response.setHeader("Timing-Allow-Origin", "*");
					response
						.status(200)
						.write(Buffer.from(blob.content, "base64"), () => response.end());
				})
				.catch((error) => {
					response.status(error?.code ?? 400).json(error?.message ?? error);
				});
		},
	);

	return router;
}
