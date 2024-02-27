/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import type { ITenantManager } from "@fluidframework/server-services-core";
import { createGetLatestSummaryApiRoute } from "./getLatestSummaryApi";

/**
 * Main entrypoint that creates a set of API Routes related to Fluid Framework Summaries that are assigned to an {@link Router}
 * which can then be used with an Express server.
 */
export function create(tenantManager: ITenantManager): Router {
	const router: Router = Router();

	createGetLatestSummaryApiRoute(tenantManager, router);

	router.use("/summaries", router);
	return router;
}
