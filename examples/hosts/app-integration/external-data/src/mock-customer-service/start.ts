/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { customerServicePort } from "../mock-customer-service-interface";
import { externalDataServicePort } from "../mock-external-data-service-interface";
import { initializeCustomerService, fluidServicePort } from "./service";

/**
 * Initializes the mock customer service on its {@link customerServicePort | default port}.
 */
initializeCustomerService({
	port: customerServicePort,
	externalDataServiceWebhookRegistrationUrl: `http://localhost:${externalDataServicePort}/register-for-webhook`,
	fluidServiceUrl: `http://localhost:${fluidServicePort}/task-list-hook`,
}).catch((error) => {
	console.error(`There was an error initializing the mock customer service:\n${error}`);

	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
});
