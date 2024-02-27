/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IWebhookManager } from "@fluidframework/server-services-core";
import { Router } from "express";
import { createSubscribeWebhookUrlApiRoute } from "./subscribeWebhookApi";
import { createUnsubscribeWebhookUrlApiRoute } from "./unsubscribeWebhookApi";

/**
 * Main entrypoint for adding webhooks routes that are assigned to an {@link Router}
 * which can then be used with an Express server.
 */
export function create(webhookManager: IWebhookManager): Router {
	const router: Router = Router();

	createSubscribeWebhookUrlApiRoute(router, webhookManager);
	createUnsubscribeWebhookUrlApiRoute(router, webhookManager);

	router.use("/webhooks", router);

	return router;
}
