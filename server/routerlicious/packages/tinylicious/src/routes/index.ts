/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import { IDocumentStorage, MongoManager } from "@fluidframework/server-services-core";
import { Router } from "express";
import { Provider } from "nconf";

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
