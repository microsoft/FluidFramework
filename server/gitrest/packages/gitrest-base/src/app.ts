/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateRepoParams } from "@fluidframework/gitresources";
import { DriverVersionHeaderName } from "@fluidframework/server-services-client";
import {
	BaseTelemetryProperties,
	HttpProperties,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import {
	alternativeMorganLoggerMiddleware,
	bindTelemetryContext,
	jsonMorganLoggerMiddleware,
	ResponseSizeMiddleware,
} from "@fluidframework/server-services-utils";
import { json, urlencoded } from "body-parser";
import cors from "cors";
import express, { Express } from "express";
import nconf from "nconf";
import * as routes from "./routes";
import {
	Constants,
	getRepoManagerParamsFromRequest,
	IFileSystemManagerFactories,
	IRepoManagerParams,
	IRepositoryManagerFactory,
} from "./utils";
import { IReadinessCheck } from "@fluidframework/server-services-core";
import { createHealthCheckEndpoints } from "@fluidframework/server-services-shared";

function getTenantIdForGitRestRequest(params: IRepoManagerParams, request: express.Request) {
	return params.storageRoutingId?.tenantId ?? (request.body as ICreateRepoParams)?.name;
}

export function create(
	store: nconf.Provider,
	fileSystemManagerFactories: IFileSystemManagerFactories,
	repositoryManagerFactory: IRepositoryManagerFactory,
	startupCheck: IReadinessCheck,
	readinessCheck?: IReadinessCheck,
) {
	// Express app configuration
	const app: Express = express();

	app.use(bindTelemetryContext());
	const loggerFormat = store.get("logger:morganFormat");
	if (loggerFormat === "json") {
		const enableResponseCloseLatencyMetric =
			store.get("enableResponseCloseLatencyMetric") ?? false;
		app.use(
			jsonMorganLoggerMiddleware(
				"gitrest",
				(tokens, req, res) => {
					const params = getRepoManagerParamsFromRequest(req);
					const additionalProperties: Record<string, any> = {
						[HttpProperties.driverVersion]: tokens.req(
							req,
							res,
							DriverVersionHeaderName,
						),
						[BaseTelemetryProperties.tenantId]: getTenantIdForGitRestRequest(
							params,
							req,
						),
						[BaseTelemetryProperties.documentId]: params.storageRoutingId?.documentId,
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

	const requestSize = store.get("requestSizeLimit");

	app.use(cors());
	const responseSizeLimitInMegabytes = store.get("responseSizeLimitInMegabytes") ?? 97; // 97MB
	const responseSizeMiddleware = new ResponseSizeMiddleware(responseSizeLimitInMegabytes);
	app.use(responseSizeMiddleware.validateResponseSize());

	const v1Router = express.Router();
	const v1ApiRoutes = routes.createV1(
		store,
		fileSystemManagerFactories,
		repositoryManagerFactory,
	);
	// Only use bodyParser for v1 routes
	// v2 routes do not use bodyParser to avoid loading the entire body into memory
	v1Router.use(json({ limit: requestSize }));
	v1Router.use(urlencoded({ limit: requestSize, extended: false }));
	v1Router.use(v1ApiRoutes.git.blobs);
	v1Router.use(v1ApiRoutes.git.refs);
	v1Router.use(v1ApiRoutes.git.repos);
	v1Router.use(v1ApiRoutes.git.tags);
	v1Router.use(v1ApiRoutes.git.trees);
	v1Router.use(v1ApiRoutes.git.commits);
	v1Router.use(v1ApiRoutes.repository.commits);
	v1Router.use(v1ApiRoutes.repository.contents);
	v1Router.use(v1ApiRoutes.summaries);

	const v2Router = express.Router();
	const v2ApiRoutes = routes.createV2(
		store,
		fileSystemManagerFactories,
		repositoryManagerFactory,
	);
	// TEMP: use bodyParser for v2 routes until implementation changes are made
	// or body parser is used more specifically
	v2Router.use(json({ limit: requestSize }));
	v2Router.use(urlencoded({ limit: requestSize, extended: false }));
	v2Router.use(v2ApiRoutes.git.refs);
	v2Router.use(v2ApiRoutes.git.repos);
	v2Router.use(v2ApiRoutes.repository.commits);
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
		"gitrest",
		startupCheck,
		readinessCheck,
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
			Lumberjack.error(err.message, { status: err.status }, err);
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
		Lumberjack.error(err.message, { status: err.status }, err);
		res.status(err.status || 500);
		res.json({
			error: {},
			message: err.message,
		});
	});

	return app;
}
