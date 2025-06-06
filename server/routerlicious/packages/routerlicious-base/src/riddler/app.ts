/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CallingServiceHeaderName } from "@fluidframework/server-services-client";
import { ISecretManager, ICache, IReadinessCheck } from "@fluidframework/server-services-core";
import { createHealthCheckEndpoints } from "@fluidframework/server-services-shared";
import {
	BaseTelemetryProperties,
	CommonProperties,
} from "@fluidframework/server-services-telemetry";
import {
	alternativeMorganLoggerMiddleware,
	bindTelemetryContext,
	jsonMorganLoggerMiddleware,
	ITenantKeyGenerator,
} from "@fluidframework/server-services-utils";
import * as bodyParser from "body-parser";
import express from "express";

import { catch404, getTenantIdFromRequest, handleError } from "../utils";

import * as api from "./api";
import { ITenantRepository } from "./mongoTenantRepository";

export function create(
	tenantRepository: ITenantRepository,
	loggerFormat: string,
	baseOrdererUrl: string,
	defaultHistorianUrl: string,
	defaultInternalHistorianUrl: string,
	secretManager: ISecretManager,
	fetchTenantKeyMetricInterval: number,
	riddlerStorageRequestMetricInterval: number,
	tenantKeyGenerator: ITenantKeyGenerator,
	startupCheck: IReadinessCheck,
	cache?: ICache,
	readinessCheck?: IReadinessCheck,
) {
	// Express app configuration
	const app: express.Express = express();

	// Running behind iisnode
	app.set("trust proxy", 1);

	app.use(bindTelemetryContext("riddler"));
	if (loggerFormat === "json") {
		app.use(
			jsonMorganLoggerMiddleware("riddler", (tokens, req, res) => {
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
	// eslint-disable-next-line import/namespace
	app.use(bodyParser.json());
	// eslint-disable-next-line import/namespace
	app.use(bodyParser.urlencoded({ extended: false }));

	app.use(
		"/api",
		api.create(
			tenantRepository,
			baseOrdererUrl,
			defaultHistorianUrl,
			defaultInternalHistorianUrl,
			secretManager,
			fetchTenantKeyMetricInterval,
			riddlerStorageRequestMetricInterval,
			tenantKeyGenerator,
			cache,
		),
	);

	const healthEndpoints = createHealthCheckEndpoints("riddler", startupCheck, readinessCheck);

	app.use("/healthz", healthEndpoints);
	// Catch 404 and forward to error handler
	app.use(catch404());

	// Error handlers

	app.use(handleError(app.get("env") === "development"));

	return app;
}
