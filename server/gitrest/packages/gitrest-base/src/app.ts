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
		const enableEventLoopLagMetric = store.get("enableEventLoopLagMetric") ?? false;
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
				enableEventLoopLagMetric,
			),
		);
	} else {
		app.use(alternativeMorganLoggerMiddleware(loggerFormat));
	}

	const requestSize = store.get("requestSizeLimit");
	app.use(json({ limit: requestSize }));
	app.use(urlencoded({ limit: requestSize, extended: false }));

	app.use(cors());
	const responseSizeLimitInMegabytes = store.get("responseSizeLimitInMegabytes") ?? 97; // 97MB
	const responseSizeMiddleware = new ResponseSizeMiddleware(responseSizeLimitInMegabytes);
	app.use(responseSizeMiddleware.validateResponseSize());

	const apiRoutes = routes.create(store, fileSystemManagerFactories, repositoryManagerFactory);
	app.use(apiRoutes.git.blobs);
	app.use(apiRoutes.git.refs);
	app.use(apiRoutes.git.repos);
	app.use(apiRoutes.git.tags);
	app.use(apiRoutes.git.trees);
	app.use(apiRoutes.git.commits);
	app.use(apiRoutes.repository.commits);
	app.use(apiRoutes.repository.contents);
	app.use(apiRoutes.summaries);

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
