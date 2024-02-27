/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import {
	IDocumentStorage,
	MongoManager,
	type IWebhookManager,
	type ITenantManager,
} from "@fluidframework/server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import * as ordering from "./ordering";
import * as storage from "./storage";
import * as webhook from "./webhooks";
import * as summary from "./summaries";

export interface IRoutes {
	ordering: Router;
	storage: Router;
}

export function create(
	config: Provider,
	mongoManager: MongoManager,
	documentStorage: IDocumentStorage,
	tenantManager: ITenantManager,
	// eslint-disable-next-line import/no-deprecated
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
	webookManager?: IWebhookManager,
) {
	return {
		ordering: ordering.create(
			config,
			documentStorage,
			mongoManager,
			collaborationSessionEventEmitter,
		),
		storage: storage.create(config),
		summary: summary.create(tenantManager),
		webhook: webookManager ? webhook.create(webookManager) : undefined,
	};
}
