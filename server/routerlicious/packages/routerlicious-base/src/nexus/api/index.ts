/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";
import cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import * as api from "./api";

export function create(
	config: Provider,
	tenantManager: core.ITenantManager,
	tenantThrottlers: Map<string, core.IThrottler>,
	storage: core.IDocumentStorage,
	webSocketServer: core.IWebSocketServer,
): Router {
	const router = Router();

	const apiRoute = api.create(config, tenantManager, tenantThrottlers, storage, webSocketServer);

	router.use(cors());
	router.use("/api/v1", apiRoute);

	return router;
}
