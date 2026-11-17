/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";
import {
	DriverVersionHeaderName,
	CallingServiceHeaderName,
} from "@fluidframework/server-services-client";
import type {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
	IDocumentManager,
	IReadinessCheck,
	IDenyList,
} from "@fluidframework/server-services-core";
import {
	RestLessServer,
	createHealthCheckEndpoints,
	validateRequestParams,
	handleResponse,
} from "@fluidframework/server-services-shared";
import {
	BaseTelemetryProperties,
	CommonProperties,
	HttpProperties,
} from "@fluidframework/server-services-telemetry";
import {
	alternativeMorganLoggerMiddleware,
	bindAbortControllerContext,
	bindTelemetryContext,
	jsonMorganLoggerMiddleware,
	denyListMiddleware,
} from "@fluidframework/server-services-utils";
import { json, urlencoded } from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import type * as nconf from "nconf";

import * as routes from "./routes";
import {
	createGitService,
	getTokenDocumentIdentity,
	resolveTrustedCreateContext,
	verifyToken,
} from "./routes/utils";
import type {
	ICache,
	ITenantService,
	ISimplifiedCustomDataRetriever,
	IPostEphemeralContainerChecker,
	IDocumentAccessAuthorizer,
	ITrustedCreateContextResolver,
} from "./services";
import { Constants, getDocumentIdFromRequest, getTenantIdFromRequest } from "./utils";

export function create(
	config: nconf.Provider,
	tenantService: ITenantService,
	storageNameRetriever: IStorageNameRetriever | undefined,
	restTenantThrottlers: Map<string, IThrottler>,
	restClusterThrottlers: Map<string, IThrottler>,
	documentManager: IDocumentManager,
	startupCheck: IReadinessCheck,
	cache?: ICache,
	revokedTokenChecker?: IRevokedTokenChecker,
	denyList?: IDenyList,
	ephemeralDocumentTTLSec?: number,
	readinessCheck?: IReadinessCheck,
	simplifiedCustomDataRetriever?: ISimplifiedCustomDataRetriever,
	postEphemeralContainerChecker?: IPostEphemeralContainerChecker,
	documentAccessAuthorizer?: IDocumentAccessAuthorizer,
	trustedCreateContextResolver?: ITrustedCreateContextResolver,
) {
	// Express app configuration
	const app: express.Express = express();
	const axiosAbortSignalEnabled = config.get("axiosAbortSignalEnabled") ?? false;

	const requestSize = config.get("requestSizeLimit");
	// initialize RestLess server translation
	const restLessMiddleware: () => express.RequestHandler = () => {
		const restLessServer = new RestLessServer({ requestSizeLimit: requestSize });
		return (req, res, next) => {
			restLessServer
				.translate(req, res)
				.then(() => next())
				.catch(next);
		};
	};
	app.use(restLessMiddleware());

	app.use(bindTelemetryContext("historian"));
	if (axiosAbortSignalEnabled) {
		app.use(bindAbortControllerContext());
	}
	const loggerFormat = config.get("logger:morganFormat");
	if (loggerFormat === "json") {
		const enableResponseCloseLatencyMetric =
			config.get("enableResponseCloseLatencyMetric") ?? false;
		const enableEventLoopLagMetric = config.get("enableEventLoopLagMetric") ?? false;
		app.use(
			jsonMorganLoggerMiddleware(
				"historian",
				(tokens, req, res) => {
					const tenantId = getTenantIdFromRequest(req.params);
					const authHeader = req.get("Authorization");
					const documentId = getDocumentIdFromRequest(tenantId, authHeader);
					const additionalProperties: Record<string, any> = {
						[HttpProperties.driverVersion]: tokens.req(
							req,
							res,
							DriverVersionHeaderName,
						),
						[BaseTelemetryProperties.tenantId]: tenantId,
						[BaseTelemetryProperties.documentId]: documentId,
						[CommonProperties.callingServiceName]:
							req.headers[CallingServiceHeaderName] ?? "",
					};
					res.locals.tenantId = tenantId;
					res.locals.documentId = documentId;
					if (req.get(Constants.IsEphemeralContainer) !== undefined) {
						additionalProperties.isEphemeralContainer = req.get(
							Constants.IsEphemeralContainer,
						);
					}
					return additionalProperties;
				},
				enableResponseCloseLatencyMetric,
				enableEventLoopLagMetric,
			),
		);
	} else {
		app.use(alternativeMorganLoggerMiddleware(loggerFormat));
	}

	app.use(json({ limit: requestSize }));
	app.use(urlencoded({ limit: requestSize, extended: false }));

	app.use(compression());
	app.use(cors());

	if (config.get("restGitService:gitrestOwnershipValidation") === true) {
		app.post(
			"/repos/:ignored?/:tenantId/internal/document-storage/initialize",
			validateRequestParams("tenantId"),
			verifyToken(
				revokedTokenChecker,
				[ScopeType.DocWrite],
				config.get("maxTokenLifetimeSec"),
			),
			(request, _response, next) => {
				request.params.id = getTokenDocumentIdentity(
					request.params.tenantId,
					request.get("Authorization"),
				).documentId;
				next();
			},
			denyListMiddleware(denyList),
			(request, response) => {
				const result = (async () => {
					const { accessToken } = getTokenDocumentIdentity(
						request.params.tenantId,
						request.get("Authorization"),
					);
					const authenticatedTenantDetails = await tenantService.getTenant(
						request.params.tenantId,
						accessToken,
						false,
					);
					const trustedCreateContext =
						documentAccessAuthorizer === undefined
							? undefined
							: await resolveTrustedCreateContext({
									tenantId: request.params.tenantId,
									documentId: request.params.id,
									resolver: trustedCreateContextResolver,
									opaqueToken: request.get("Fluid-Create-Context"),
									containerTypeHint: "durable",
							  });
					const service = await createGitService({
						config,
						tenantId: request.params.tenantId,
						authorization: request.get("Authorization"),
						tenantService,
						authenticatedTenantDetails,
						storageNameRetriever,
						documentManager,
						cache,
						initialUpload: true,
						storageName: request.get("StorageName"),
						isEphemeralContainer: false,
						ephemeralDocumentTTLSec,
						simplifiedCustomDataRetriever,
						postEphemeralContainerChecker,
						query: request.query,
						accessOperation: "create",
						containerTypeHint: "durable",
						documentAccessAuthorizer,
						trustedCreateContext,
					});
					await service.initializeDocumentStorage();
				})();
				handleResponse(result, response, false, undefined, 204);
			},
		);
	}

	const apiRoutes = routes.create(
		config,
		tenantService,
		storageNameRetriever,
		restTenantThrottlers,
		restClusterThrottlers,
		documentManager,
		cache,
		revokedTokenChecker,
		denyList,
		ephemeralDocumentTTLSec,
		simplifiedCustomDataRetriever,
		postEphemeralContainerChecker,
		documentAccessAuthorizer,
		trustedCreateContextResolver,
	);
	app.use(apiRoutes.git.blobs);
	app.use(apiRoutes.git.refs);
	app.use(apiRoutes.git.tags);
	app.use(apiRoutes.git.trees);
	app.use(apiRoutes.git.commits);
	app.use(apiRoutes.repository.commits);
	app.use(apiRoutes.repository.contents);
	app.use(apiRoutes.repository.headers);
	app.use(apiRoutes.summaries);

	const healthCheckEndpoints = createHealthCheckEndpoints(
		"historian",
		startupCheck,
		readinessCheck,
		false /* createLivenessEndpoint */,
	);
	app.use("/healthz", healthCheckEndpoints);

	// catch 404 and forward to error handler
	app.use((req, res, next) => {
		const err = new Error("Not Found");
		(err as any).status = 404;
		next(err);
	});

	// error handlers

	// development error handler
	// will print stacktrace
	if (app.get("env") === "development") {
		app.use((err, req, res, next) => {
			res.status(err.status || 500);
			res.json({
				error: err,
				message: err.message,
			});
		});
	}

	// production error handler
	// no stacktraces leaked to user
	app.use((err, req, res, next) => {
		res.status(err.status || 500);
		res.json({
			error: {},
			message: err.message,
		});
	});

	return app;
}
