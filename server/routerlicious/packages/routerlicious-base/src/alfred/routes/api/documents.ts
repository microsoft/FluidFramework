/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import {
	IDocumentStorage,
	IThrottler,
	ITenantManager,
	ICache,
	IDocumentRepository,
	ITokenRevocationManager,
} from "@fluidframework/server-services-core";
import {
	verifyStorageToken,
	getCreationToken,
	throttle,
	IThrottleMiddlewareOptions,
	getParam,
	validateTokenScopeClaims,
	getBooleanFromConfig,
} from "@fluidframework/server-services-utils";
import { validateRequestParams, handleResponse } from "@fluidframework/server-services";
import { Router } from "express";
import winston from "winston";
import {
	IAlfredTenant,
	ISession,
	NetworkError,
	DocDeleteScopeType,
	TokenRevokeScopeType,
} from "@fluidframework/server-services-client";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { Provider } from "nconf";
import { v4 as uuid } from "uuid";
import { Constants, getSession } from "../../../utils";
import { IDocumentDeleteService } from "../../services";

export function create(
	storage: IDocumentStorage,
	appTenants: IAlfredTenant[],
	tenantThrottlers: Map<string, IThrottler>,
	clusterThrottlers: Map<string, IThrottler>,
	singleUseTokenCache: ICache,
	config: Provider,
	tenantManager: ITenantManager,
	documentRepository: IDocumentRepository,
	documentDeleteService: IDocumentDeleteService,
	tokenManager?: ITokenRevocationManager,
): Router {
	const router: Router = Router();
	const externalOrdererUrl: string = config.get("worker:serverUrl");
	const externalHistorianUrl: string = config.get("worker:blobStorageUrl");
	const externalDeltaStreamUrl: string =
		config.get("worker:deltaStreamUrl") || externalOrdererUrl;
	const sessionStickinessDurationMs: number | undefined = config.get(
		"alfred:sessionStickinessDurationMs",
	);
	// Whether to enforce server-generated document ids in create doc flow
	const enforceServerGeneratedDocumentId: boolean =
		config.get("alfred:enforceServerGeneratedDocumentId") ?? false;

	// Throttling logic for per-tenant rate-limiting at the HTTP route level
	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId") || appTenants[0].id,
		throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
	};
	const generalTenantThrottler = tenantThrottlers.get(Constants.generalRestCallThrottleIdPrefix);

	const createDocTenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId") || appTenants[0].id,
		throttleIdSuffix: Constants.createDocThrottleIdPrefix,
	};
	const getSessionTenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId") || appTenants[0].id,
		throttleIdSuffix: Constants.getSessionThrottleIdPrefix,
	};

	// Throttling logic for per-cluster rate-limiting at the HTTP route level
	const createDocClusterThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: Constants.createDocThrottleIdPrefix,
		throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
	};
	const getSessionClusterThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: Constants.getSessionThrottleIdPrefix,
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
		tokenCache: singleUseTokenCache,
	};

	router.get(
		"/:tenantId/:id",
		validateRequestParams("tenantId", "id"),
		throttle(generalTenantThrottler, winston, tenantThrottleOptions),
		verifyStorageToken(tenantManager, config, tokenManager, defaultTokenValidationOptions),
		(request, response, next) => {
			const documentP = storage.getDocument(
				getParam(request.params, "tenantId") || appTenants[0].id,
				getParam(request.params, "id"),
			);
			documentP.then(
				(document) => {
					if (!document || document.scheduledDeletionTime) {
						response.status(404);
					}
					response.status(200).json(document);
				},
				(error) => {
					response.status(400).json(error);
				},
			);
		},
	);

	/**
	 * Creates a new document with initial summary.
	 */
	router.post(
		"/:tenantId",
		validateRequestParams("tenantId"),
		throttle(
			clusterThrottlers.get(Constants.createDocThrottleIdPrefix),
			winston,
			createDocClusterThrottleOptions,
		),
		throttle(
			tenantThrottlers.get(Constants.createDocThrottleIdPrefix),
			winston,
			createDocTenantThrottleOptions,
		),
		verifyStorageToken(tenantManager, config, tokenManager, {
			requireDocumentId: false,
			ensureSingleUseToken: true,
			singleUseTokenCache,
			enableTokenCache: enableJwtTokenCache,
			tokenCache: singleUseTokenCache,
		}),
		async (request, response, next) => {
			// Tenant and document
			const tenantId = getParam(request.params, "tenantId");
			// If enforcing server generated document id, ignore id parameter
			const id = enforceServerGeneratedDocumentId
				? uuid()
				: (request.body.id as string) || uuid();

			// Summary information
			const summary = request.body.summary;

			// Protocol state
			const { sequenceNumber, values, generateToken = false } = request.body;

			const enableDiscovery: boolean = request.body.enableDiscovery ?? false;

			const createP = storage.createDocument(
				tenantId,
				id,
				summary,
				sequenceNumber,
				crypto.randomBytes(4).toString("hex"),
				externalOrdererUrl,
				externalHistorianUrl,
				externalDeltaStreamUrl,
				values,
				enableDiscovery,
			);

			// Handle backwards compatibility for older driver versions.
			// TODO: remove condition once old drivers are phased out and all clients can handle object response
			const clientAcceptsObjectResponse = enableDiscovery === true || generateToken === true;
			if (clientAcceptsObjectResponse) {
				const responseBody = { id, token: undefined, session: undefined };
				if (generateToken) {
					// Generate creation token given a jwt from header
					const authorizationHeader = request.header("Authorization");
					const tokenRegex = /Basic (.+)/;
					const tokenMatch = tokenRegex.exec(authorizationHeader);
					const token = tokenMatch[1];
					const tenantKey = await tenantManager.getKey(tenantId);
					responseBody.token = getCreationToken(token, tenantKey, id);
				}
				if (enableDiscovery) {
					// Session information
					const session: ISession = {
						ordererUrl: externalOrdererUrl,
						historianUrl: externalHistorianUrl,
						deltaStreamUrl: externalDeltaStreamUrl,
						// Indicate to consumer that session was newly created.
						isSessionAlive: false,
						isSessionActive: false,
					};
					responseBody.session = session;
				}
				handleResponse(
					createP.then(() => responseBody),
					response,
					undefined,
					undefined,
					201,
				);
			} else {
				handleResponse(
					createP.then(() => id),
					response,
					undefined,
					undefined,
					201,
				);
			}
		},
	);

	/**
	 * Get the session information.
	 */
	router.get(
		"/:tenantId/session/:id",
		throttle(
			clusterThrottlers.get(Constants.getSessionThrottleIdPrefix),
			winston,
			getSessionClusterThrottleOptions,
		),
		throttle(
			tenantThrottlers.get(Constants.getSessionThrottleIdPrefix),
			winston,
			getSessionTenantThrottleOptions,
		),
		verifyStorageToken(tenantManager, config, tokenManager, defaultTokenValidationOptions),
		async (request, response, next) => {
			const documentId = getParam(request.params, "id");
			const tenantId = getParam(request.params, "tenantId");
			const session = getSession(
				externalOrdererUrl,
				externalHistorianUrl,
				externalDeltaStreamUrl,
				tenantId,
				documentId,
				documentRepository,
				sessionStickinessDurationMs,
			);
			handleResponse(session, response, false);
		},
	);

	/**
	 * Delete a document
	 */
	router.delete(
		"/:tenantId/document/:id",
		validateRequestParams("tenantId", "id"),
		validateTokenScopeClaims(DocDeleteScopeType),
		verifyStorageToken(tenantManager, config, tokenManager, defaultTokenValidationOptions),
		async (request, response, next) => {
			const documentId = getParam(request.params, "id");
			const tenantId = getParam(request.params, "tenantId");
			const lumberjackProperties = getLumberBaseProperties(documentId, tenantId);
			Lumberjack.info(`Received document delete request.`, lumberjackProperties);

			const deleteP = documentDeleteService.deleteDocument(tenantId, documentId);
			handleResponse(deleteP, response, undefined, undefined, 204);
		},
	);

	/**
	 * Revoke an access token
	 */
	router.post(
		"/:tenantId/document/:id/revokeToken",
		validateRequestParams("tenantId", "id"),
		throttle(generalTenantThrottler, winston, tenantThrottleOptions),
		validateTokenScopeClaims(TokenRevokeScopeType),
		verifyStorageToken(tenantManager, config, tokenManager, defaultTokenValidationOptions),
		async (request, response, next) => {
			const documentId = getParam(request.params, "id");
			const tenantId = getParam(request.params, "tenantId");
			const lumberjackProperties = getLumberBaseProperties(documentId, tenantId);
			Lumberjack.info(`Received token revocation request.`, lumberjackProperties);

			const tokenId = request.body.jti;
			if (!tokenId || typeof tokenId !== "string") {
				return handleResponse(
					Promise.reject(
						new NetworkError(400, `Missing or invalid jti in request body.`),
					),
					response,
				);
			}
			if (tokenManager) {
				const resultP = tokenManager.revokeToken(tenantId, documentId, tokenId);
				return handleResponse(resultP, response);
			} else {
				return handleResponse(
					Promise.reject(
						new NetworkError(
							501,
							"Token revocation is not supported for now",
							false /* canRetry */,
							true /* isFatal */,
						),
					),
					response,
				);
			}
		},
	);
	return router;
}
