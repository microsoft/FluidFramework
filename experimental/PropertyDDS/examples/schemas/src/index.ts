/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { schemas as SQUARES_DEMO_SCHEMAS } from "./squares_demo/index.js";

export { registerSchemas } from "./schemasRegisterer.js";

// eslint-disable-next-line unicorn/prefer-export-from
export { SQUARES_DEMO_SCHEMAS };

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ALL_SCHEMAS = {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	SQUARES_DEMO_SCHEMAS,
};
