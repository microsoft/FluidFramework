/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { json, urlencoded } from "body-parser";
import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import { Provider } from "nconf";
import { DriverVersionHeaderName } from "@fluidframework/server-services-client";
import {
	alternativeMorganLoggerMiddleware,
	bindCorrelationId,
	jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import { RestLessServer } from "@fluidframework/server-services";
import { BaseTelemetryProperties, HttpProperties } from "@fluidframework/server-services-telemetry";
import { catch404, getIdFromRequest, getTenantIdFromRequest, handleError } from "../utils";

export function create(config: Provider) {
	// Maximum REST request size
	const requestSize = config.get("nexus:restJsonSize");

	// Express app configuration
	const app: express.Express = express();

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

	// Running behind iisnode
	app.set("trust proxy", 1);

	app.use(compression());
	const loggerFormat = config.get("logger:morganFormat");
	if (loggerFormat === "json") {
		app.use(
			jsonMorganLoggerMiddleware("nexus", (tokens, req, res) => {
				return {
					[HttpProperties.driverVersion]: tokens.req(req, res, DriverVersionHeaderName),
					[BaseTelemetryProperties.tenantId]: getTenantIdFromRequest(req.params),
					[BaseTelemetryProperties.documentId]: getIdFromRequest(req.params),
				};
			}),
		);
	} else {
		app.use(alternativeMorganLoggerMiddleware(loggerFormat));
	}

	app.use(cookieParser());
	app.use(json({ limit: requestSize }));
	app.use(urlencoded({ limit: requestSize, extended: false }));

	app.use(bindCorrelationId());

	// Catch 404 and forward to error handler
	app.use(catch404());

	// Error handlers

	app.use(handleError());

	return app;
}
