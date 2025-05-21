/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CallingServiceHeaderName } from "@fluidframework/server-services-client";
import { IReadinessCheck } from "@fluidframework/server-services-core";
import { createHealthCheckEndpoints } from "@fluidframework/server-services-shared";
import {
	BaseTelemetryProperties,
	CommonProperties,
} from "@fluidframework/server-services-telemetry";
import {
	alternativeMorganLoggerMiddleware,
	bindTelemetryContext,
	jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import * as bodyParser from "body-parser";
import express from "express";
import type { Provider } from "nconf";

import { catch404, getTenantIdFromRequest, handleError } from "../utils";

export function create(
	config: Provider,
	startupCheck: IReadinessCheck,
	readinessCheck?: IReadinessCheck,
) {
	// Express app configuration
	const app: express.Express = express();

	// Running behind iisnode
	app.set("trust proxy", 1);

	app.use(bindTelemetryContext("nexus"));
	const loggerFormat = config.get("logger:morganFormat");
	if (loggerFormat === "json") {
		app.use(
			jsonMorganLoggerMiddleware("nexus", (tokens, req, res) => {
				return {
					[BaseTelemetryProperties.tenantId]: getTenantIdFromRequest(req.params),
					[CommonProperties.callingServiceName]:
						req.headers[CallingServiceHeaderName] ?? "",
				};
			}),
		);
	} else {
		app.use(alternativeMorganLoggerMiddleware(loggerFormat));
	}
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: false }));

	const healthEndpoints = createHealthCheckEndpoints("nexus", startupCheck, readinessCheck);

	app.use("/healthz", healthEndpoints);
	// Catch 404 and forward to error handler
	app.use(catch404());

	// Error handlers

	app.use(handleError(app.get("env") === "development"));

	return app;
}
