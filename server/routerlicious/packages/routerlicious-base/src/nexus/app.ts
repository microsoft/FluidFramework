/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseTelemetryProperties, CommonProperties } from "@fluidframework/server-services-telemetry";
import * as bodyParser from "body-parser";
import express from "express";
import {
	alternativeMorganLoggerMiddleware,
	bindTelemetryContext,
	jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import { catch404, getTenantIdFromRequest, handleError } from "../utils";
import { createHealthCheckEndpoints } from "@fluidframework/server-services-shared";
import type { Provider } from "nconf";
import { IReadinessCheck } from "@fluidframework/server-services-core";
import { CallingServiceHeaderName } from "@fluidframework/server-services-client";

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
					[CommonProperties.callingServiceName]: req.headers[CallingServiceHeaderName] ?? "",
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
