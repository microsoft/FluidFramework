/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
} from "@fluidframework/server-services-core";
import { json, urlencoded } from "body-parser";
import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import { Provider } from "nconf";
import { DriverVersionHeaderName, IAlfredTenant } from "@fluidframework/server-services-client";
import {
	alternativeMorganLoggerMiddleware,
	bindCorrelationId,
	bindTelemetryContext,
	jsonMorganLoggerMiddleware,
} from "@fluidframework/server-services-utils";
import { RestLessServer } from "@fluidframework/server-services";
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
	tokenRevocationManager?: ITokenRevocationManager,
	revokedTokenChecker?: IRevokedTokenChecker,
) {
	// Maximum REST request size
	const requestSize = config.get("alfred:restJsonSize");

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
	const loggerFormat = config.get("logger:morganFormat");
	if (loggerFormat === "json") {
		app.use(
			jsonMorganLoggerMiddleware("alfred", (tokens, req, res) => {
				const additionalProperties: Record<string, any> = {
					[HttpProperties.driverVersion]: tokens.req(req, res, DriverVersionHeaderName),
					[BaseTelemetryProperties.tenantId]: getTenantIdFromRequest(req.params),
					[BaseTelemetryProperties.documentId]: getIdFromRequest(req.params),
				};
				if (req.body?.isEphemeralContainer !== undefined) {
					additionalProperties.isEphemeralContainer = req.body.isEphemeralContainer;
				}
				return additionalProperties;
			}),
		);
	} else {
		app.use(alternativeMorganLoggerMiddleware(loggerFormat));
	}

	app.use(cookieParser());
	app.use(json({ limit: requestSize }));
	app.use(urlencoded({ limit: requestSize, extended: false }));

	app.use(bindCorrelationId());

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
		tokenRevocationManager,
		revokedTokenChecker,
	);

	app.use(routes.api);

	// Catch 404 and forward to error handler
	app.use(catch404());

	// Error handlers

	app.use(handleError());

	return app;
}
