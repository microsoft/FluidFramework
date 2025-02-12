/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
	IDocumentManager,
	IReadinessCheck,
} from "@fluidframework/server-services-core";
import { json, urlencoded } from "body-parser";
import compression from "compression";
import cors from "cors";
import express, { Router } from "express";
import * as nconf from "nconf";
import { DriverVersionHeaderName } from "@fluidframework/server-services-client";
import {
	alternativeMorganLoggerMiddleware,
	bindTelemetryContext,
	jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import { BaseTelemetryProperties, HttpProperties } from "@fluidframework/server-services-telemetry";
import { RestLessServer, createHealthCheckEndpoints } from "@fluidframework/server-services-shared";
import * as routes from "./routes";
import { ICache, IDenyList, ITenantService, ISimplifiedCustomDataRetriever } from "./services";
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
) {
	// Express app configuration
	const app: express.Express = express();

	const requestSize = config.get("requestSizeLimit");
	const v1Router = Router();
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
	// Only use restLessMiddleware for v1 routes
	v1Router.use(restLessMiddleware());

	app.use(bindTelemetryContext());
	const loggerFormat = config.get("logger:morganFormat");
	if (loggerFormat === "json") {
		const enableResponseCloseLatencyMetric =
			config.get("enableResponseCloseLatencyMetric") ?? false;
		app.use(
			jsonMorganLoggerMiddleware(
				"historian",
				(tokens, req, res) => {
					const tenantId = getTenantIdFromRequest(req.params);
					const authHeader = req.get("Authorization");
					const additionalProperties: Record<string, any> = {
						[HttpProperties.driverVersion]: tokens.req(
							req,
							res,
							DriverVersionHeaderName,
						),
						[BaseTelemetryProperties.tenantId]: tenantId,
						[BaseTelemetryProperties.documentId]: getDocumentIdFromRequest(
							tenantId,
							authHeader,
						),
					};
					if (req.get(Constants.IsEphemeralContainer) !== undefined) {
						additionalProperties.isEphemeralContainer = req.get(
							Constants.IsEphemeralContainer,
						);
					}
					return additionalProperties;
				},
				enableResponseCloseLatencyMetric,
			),
		);
	} else {
		app.use(alternativeMorganLoggerMiddleware(loggerFormat));
	}

	app.use(compression());
	app.use(cors());

	const v1ApiRoutes = routes.createV1(
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
	);
	// Only use bodyParser for v1 routes
	// v2 routes do not use bodyParser to avoid loading the entire body into memory
	v1Router.use(json({ limit: requestSize }));
	v1Router.use(urlencoded({ limit: requestSize, extended: false }));
	v1Router.use(v1ApiRoutes.git.blobs);
	v1Router.use(v1ApiRoutes.git.refs);
	v1Router.use(v1ApiRoutes.git.tags);
	v1Router.use(v1ApiRoutes.git.trees);
	v1Router.use(v1ApiRoutes.git.commits);
	v1Router.use(v1ApiRoutes.repository.commits);
	v1Router.use(v1ApiRoutes.repository.contents);
	v1Router.use(v1ApiRoutes.repository.headers);
	v1Router.use(v1ApiRoutes.summaries);

	const v2Router = Router();
	const v2ApiRoutes = routes.createV2(
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
	);
	v2Router.use(v2ApiRoutes.summaries);

	// Split v1 and v2 routes by version param
	app.use((req, res, next) => {
		// Any request without a valid version is sent to v1
		const version = routes.getApiVersion(req);
		if (version === routes.ApiVersion.V1) {
			v1Router(req, res, next);
		} else if (version === routes.ApiVersion.V2) {
			v2Router(req, res, next);
		}
	});

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
