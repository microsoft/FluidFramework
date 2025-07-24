/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import type { TypedEventEmitter } from "@fluidframework/common-utils";
import type { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import type { IDocumentStorage, MongoManager } from "@fluidframework/server-services-core";
import type { Router } from "express";
import type { Provider } from "nconf";

import * as ordering from "./ordering";
import * as storage from "./storage";

export interface IRoutes {
	ordering: Router;
	storage: Router;
}

export function create(
	config: Provider,
	mongoManager: MongoManager,
	documentStorage: IDocumentStorage,
	// eslint-disable-next-line import/no-deprecated
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
) {
	return {
		ordering: ordering.create(
			config,
			documentStorage,
			mongoManager,
			collaborationSessionEventEmitter,
		),
		storage: storage.create(config),
	};
}
