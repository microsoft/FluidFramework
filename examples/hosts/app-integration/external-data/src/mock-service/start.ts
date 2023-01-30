/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { customerServicePort } from "../mock-service-interface";
import { ExternalDataSource } from "./externalData";
import { initializeCustomerService } from "./service";

initializeCustomerService({
	externalDataSource: new ExternalDataSource(),
	port: customerServicePort,
}).catch((error) => {
	console.error(`There was an error initializing the mock customer service:\n${error}`);

	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
});
