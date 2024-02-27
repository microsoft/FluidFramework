/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import type { IWebhookManager } from "@fluidframework/server-services-core";
import { createSubscribeWebhookUrlApiRoute } from "./subscribeWebhookApi";
import { createUnsubscribeWebhookUrlApiRoute } from "./unsubscribeWebhookApi";

/**
 * Main entrypoint for adding webhooks routes that are assigned to an {@link Router}
 * which can then be used with an Express server.
 */
export function create(webhookManager: IWebhookManager): Router {
	const webhooksRouter = Router();
	createSubscribeWebhookUrlApiRoute(webhookManager, webhooksRouter);
	createUnsubscribeWebhookUrlApiRoute(webhookManager, webhooksRouter);

	const router: Router = Router();
	router.use("/webhooks", webhooksRouter);
	return router;
}
