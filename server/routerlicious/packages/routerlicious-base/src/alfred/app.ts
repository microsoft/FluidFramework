/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isIPv4, isIPv6 } from "net";
import {
	IDeltaService,
	IDocumentStorage,
	IProducer,
	ITenantManager,
	IThrottler,
	ICache,
	IDocumentRepository,
	ITokenRevocationManager,
	IRevokedTokenChecker,
	IClusterDrainingChecker,
	IFluidAccessTokenGenerator,
	IReadinessCheck,
	TypedEventEmitter,
} from "@fluidframework/server-services-core";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import { json, urlencoded } from "body-parser";
import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import shajs from "sha.js";
import { Provider } from "nconf";
import { DriverVersionHeaderName, IAlfredTenant } from "@fluidframework/server-services-client";
import {
	alternativeMorganLoggerMiddleware,
	bindTelemetryContext,
	bindTimeoutContext,
	jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import { RestLessServer, IHttpServerConfig } from "@fluidframework/server-services";
import { BaseTelemetryProperties, HttpProperties } from "@fluidframework/server-services-telemetry";
import { catch404, getIdFromRequest, getTenantIdFromRequest, handleError } from "../utils";
import { IDocumentDeleteService } from "./services";
import * as alfredRoutes from "./routes";

export function create(
	config: Provider,
	tenantManager: ITenantManager,
	tenantThrottlers: Map<string, IThrottler>,
	clusterThrottlers: Map<string, IThrottler>,
	singleUseTokenCache: ICache,
	storage: IDocumentStorage,
	appTenants: IAlfredTenant[],
	deltaService: IDeltaService,
	producer: IProducer,
	documentRepository: IDocumentRepository,
	documentDeleteService: IDocumentDeleteService,
	startupCheck: IReadinessCheck,
	tokenRevocationManager?: ITokenRevocationManager,
	revokedTokenChecker?: IRevokedTokenChecker,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
	clusterDrainingChecker?: IClusterDrainingChecker,
	enableClientIPLogging?: boolean,
	readinessCheck?: IReadinessCheck,
	fluidAccessTokenGenerator?: IFluidAccessTokenGenerator,
) {
	// Maximum REST request size
	const requestSize = config.get("alfred:restJsonSize");
	const enableLatencyMetric = config.get("alfred:enableLatencyMetric") ?? false;
	const enableEventLoopLagMetric = config.get("alfred:enableEventLoopLagMetric") ?? false;
	const httpServerConfig: IHttpServerConfig = config.get("system:httpServer");

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
	app.use(bindTelemetryContext());
	if (httpServerConfig?.connectionTimeoutMs) {
		// If connectionTimeoutMs configured and not 0, bind timeout context.
		app.use(bindTimeoutContext(httpServerConfig.connectionTimeoutMs));
	}
	const loggerFormat = config.get("logger:morganFormat");
	if (loggerFormat === "json") {
		app.use(
			jsonMorganLoggerMiddleware(
				"alfred",
				(tokens, req, res) => {
					const additionalProperties: Record<string, any> = {
						[HttpProperties.driverVersion]: tokens.req(
							req,
							res,
							DriverVersionHeaderName,
						),
						[BaseTelemetryProperties.tenantId]: getTenantIdFromRequest(req.params),
						[BaseTelemetryProperties.documentId]: getIdFromRequest(req.params),
					};
					if (enableClientIPLogging === true) {
						const hashedClientIP = req.ip
							? shajs("sha256").update(`${req.ip}`).digest("hex")
							: "";
						additionalProperties.hashedClientIPAddress = hashedClientIP;

						const clientIPAddress = req.ip ? req.ip : "";
						if (isIPv4(clientIPAddress)) {
							additionalProperties.clientIPType = "IPv4";
						} else if (isIPv6(clientIPAddress)) {
							additionalProperties.clientIPType = "IPv6";
						} else {
							additionalProperties.clientIPType = "";
						}

						const XAzureClientIP = "x-azure-clientip";
						const hashedAzureClientIP = req.headers[XAzureClientIP]
							? shajs("sha256").update(`${req.headers[XAzureClientIP]}`).digest("hex")
							: "";
						additionalProperties.hashedAzureClientIPAddress = hashedAzureClientIP;

						const XAzureSocketIP = "x-azure-socketip";
						const hashedAzureSocketIP = req.headers[XAzureSocketIP]
							? shajs("sha256").update(`${req.headers[XAzureSocketIP]}`).digest("hex")
							: "";
						additionalProperties.hashedAzureSocketIPAddress = hashedAzureSocketIP;
					}
					if (req.body?.isEphemeralContainer !== undefined) {
						additionalProperties.isEphemeralContainer = req.body.isEphemeralContainer;
					}
					const customHeadersToLog = (config.get("customHeadersToLog") as string[]) ?? [];
					if (customHeadersToLog) {
						customHeadersToLog.forEach((header) => {
							const lowerCaseHeader = header.toLowerCase();
							if (req.headers[lowerCaseHeader]) {
								additionalProperties[lowerCaseHeader] =
									req.headers[lowerCaseHeader];
							}
						});
					}
					return additionalProperties;
				},
				enableLatencyMetric,
				enableEventLoopLagMetric,
			),
		);
	} else {
		app.use(alternativeMorganLoggerMiddleware(loggerFormat));
	}

	app.use(cookieParser());
	app.use(json({ limit: requestSize }));
	app.use(urlencoded({ limit: requestSize, extended: false }));

	// Bind routes
	const routes = alfredRoutes.create(
		config,
		tenantManager,
		tenantThrottlers,
		clusterThrottlers,
		singleUseTokenCache,
		deltaService,
		storage,
		producer,
		appTenants,
		documentRepository,
		documentDeleteService,
		startupCheck,
		tokenRevocationManager,
		revokedTokenChecker,
		collaborationSessionEventEmitter,
		clusterDrainingChecker,
		readinessCheck,
		fluidAccessTokenGenerator,
	);

	app.use(routes.api);

	// Catch 404 and forward to error handler
	app.use(catch404());

	// Error handlers

	app.use(handleError());

	return app;
}
