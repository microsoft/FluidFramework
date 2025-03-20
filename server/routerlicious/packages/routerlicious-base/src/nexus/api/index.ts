/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";
import cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import * as api from "./api";
import type { Emitter as RedisEmitter } from "@socket.io/redis-emitter";

export function create(
	config: Provider,
	tenantManager: core.ITenantManager,
	tenantThrottlers: Map<string, core.IThrottler>,
	storage: core.IDocumentStorage,
	redisEmitter?: RedisEmitter,
): Router {
	const router = Router();

	const apiRoute = api.create(config, tenantManager, tenantThrottlers, storage, redisEmitter);

	router.use(cors());
	router.use("/api/v1", apiRoute);

	return router;
}
