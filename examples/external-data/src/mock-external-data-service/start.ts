/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { externalDataServicePort } from "../mock-external-data-service-interface/index.js";
import type { ITaskData } from "../model-interface/index.js";

import { ExternalDataSource } from "./externalDataSource.js";
import { initializeExternalDataService } from "./service.js";
import type { MockWebhook } from "./webhook.js";

/**
 * Initializes the mock external data service on its {@link externalDataServicePort | default port}.
 */
initializeExternalDataService({
	externalDataSource: new ExternalDataSource(),
	port: externalDataServicePort,
	webhookCollection: new Map<string, MockWebhook<ITaskData>>(),
	// eslint-disable-next-line unicorn/prefer-top-level-await
}).catch((error) => {
	console.error(`There was an error initializing the mock external data service:\n${error}`);

	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
});
