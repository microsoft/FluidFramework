/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { externalDataServicePort } from "../mock-external-data-service-interface";
import { ExternalDataSource } from "./externalDataSource";
import { initializeExternalDataService } from "./service";

/**
 * Initializes the mock external data service on its {@link externalDataServicePort | default port}.
 */
initializeExternalDataService({
	externalDataSource: new ExternalDataSource(),
	port: externalDataServicePort,
}).catch((error) => {
	console.error(`There was an error initializing the mock external data service:\n${error}`);

	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
});
