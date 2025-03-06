/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import {
	IDocumentStorage,
	MongoManager,
	TypedEventEmitter,
} from "@fluidframework/server-services-core";
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
