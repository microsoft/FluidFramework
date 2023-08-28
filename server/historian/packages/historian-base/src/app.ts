/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
} from "@fluidframework/server-services-core";
import { json, urlencoded } from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import * as nconf from "nconf";
import { DriverVersionHeaderName } from "@fluidframework/server-services-client";
import {
	alternativeMorganLoggerMiddleware,
	bindCorrelationId,
	jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import { BaseTelemetryProperties, HttpProperties } from "@fluidframework/server-services-telemetry";
import { RestLessServer } from "@fluidframework/server-services-shared";
import * as routes from "./routes";
import { ICache, IDenyList, ITenantService } from "./services";
import { Constants, getDocumentIdFromRequest, getTenantIdFromRequest } from "./utils";

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
) {
	// Express app configuration
	const app: express.Express = express();

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

	const loggerFormat = config.get("logger:morganFormat");
	if (loggerFormat === "json") {
		app.use(
			jsonMorganLoggerMiddleware("historian", (tokens, req, res) => {
				const tenantId = getTenantIdFromRequest(req.params);
				const additionalProperties: Record<string, any> = {
					[HttpProperties.driverVersion]: tokens.req(req, res, DriverVersionHeaderName),
					[BaseTelemetryProperties.tenantId]: tenantId,
					[BaseTelemetryProperties.documentId]: getDocumentIdFromRequest(
						tenantId,
						req.get("Authorization"),
					),
				};
				if (req.get(Constants.IsEphemeralContainer) !== undefined) {
					additionalProperties.isEphemeralContainer = req.get(
						Constants.IsEphemeralContainer,
					);
				}
				return additionalProperties;
			}),
		);
	} else {
		app.use(alternativeMorganLoggerMiddleware(loggerFormat));
	}

	app.use(json({ limit: requestSize }));
	app.use(urlencoded({ limit: requestSize, extended: false }));

	app.use(compression());
	app.use(cors());
	app.use(bindCorrelationId(asyncLocalStorage));

	const apiRoutes = routes.create(
		config,
		tenantService,
		storageNameRetriever,
		restTenantThrottlers,
		restClusterThrottlers,
		cache,
		asyncLocalStorage,
		revokedTokenChecker,
		denyList,
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
