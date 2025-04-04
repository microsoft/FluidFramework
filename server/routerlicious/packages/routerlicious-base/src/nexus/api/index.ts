/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";
import cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import * as api from "./api";
// import type { TypedEventEmitter } from "@fluidframework/common-utils";
// import type { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import type { Emitter } from "@socket.io/redis-emitter";

export function create(
	config: Provider,
	tenantManager: core.ITenantManager,
	tenantThrottlers: Map<string, core.IThrottler>,
	storage: core.IDocumentStorage,
	collaborationSessionEventEmitter?: Emitter, // TypedEventEmitter<ICollaborationSessionEvents>,
): Router {
	const router = Router();

	const apiRoute = api.create(
		config,
		tenantManager,
		tenantThrottlers,
		storage,
		collaborationSessionEventEmitter,
	);

	router.use(cors());
	router.use("/api/v1", apiRoute);

	return router;
}
