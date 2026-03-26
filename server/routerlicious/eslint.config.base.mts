/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared ESLint configuration for server/routerlicious packages.
 *
 * Re-exports the server config from @fluidframework/eslint-config-fluid.
 */

export {
	server as baseConfig,
	serverRecommended as recommendedConfig,
} from "@fluidframework/eslint-config-fluid/server.mts";
