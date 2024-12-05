/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import * as core from "@fluidframework/server-services-core";
import cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import * as api from "./api";

export function create(
	config: Provider,
	tenantThrottlers?: Map<string, core.IThrottler>,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
	storage?: core.IDocumentStorage,
): Router {
	const router = Router();

	const apiRoute = api.create(
		config,
		tenantThrottlers,
		collaborationSessionEventEmitter,
		storage,
	);

	router.use(cors());
	router.use("/api/v1", apiRoute);

	return router;
}
