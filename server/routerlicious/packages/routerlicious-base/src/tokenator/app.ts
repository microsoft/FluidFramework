import type { IAccessTokenGenerator, IReadinessCheck } from "@fluidframework/server-services-core";
import * as bodyParser from "body-parser";
import express, { type Router } from "express";
import {
	alternativeMorganLoggerMiddleware,
	bindTelemetryContext,
	jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import { catch404, getTenantIdFromRequest, handleError } from "../utils";
import { BaseTelemetryProperties } from "@fluidframework/server-services-telemetry";
import { createHealthCheckEndpoints } from "@fluidframework/server-services-shared";
import * as api from "./accessTokens";

export function create(
	loggerFormat: string,
	accessTokenGenerator: IAccessTokenGenerator,
	startupCheck: IReadinessCheck,
	routerFactory?: (accessTokenGenerator: IAccessTokenGenerator) => Router,
	readinessCheck?: IReadinessCheck,
) {
	// Express app configuration
	const app: express.Express = express();

	// Running behind iisnode
	app.set("trust proxy", 1);

	app.use(bindTelemetryContext());
	if (loggerFormat === "json") {
		app.use(
			jsonMorganLoggerMiddleware("tokenator", (tokens, req, res) => {
				return {
					[BaseTelemetryProperties.tenantId]: getTenantIdFromRequest(req.params),
				};
			}),
		);
	} else {
		app.use(alternativeMorganLoggerMiddleware(loggerFormat));
	}
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: false }));

	const routes = routerFactory
		? routerFactory(accessTokenGenerator)
		: api.create(accessTokenGenerator);
	app.use("/api", routes);

	const healthEndpoints = createHealthCheckEndpoints("tokenator", startupCheck, readinessCheck);

	app.use("/healthz", healthEndpoints);
	// Catch 404 and forward to error handler
	app.use(catch404());

	// Error handlers
	app.use(handleError(app.get("env") === "development"));
	return app;
}
