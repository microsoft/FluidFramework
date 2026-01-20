/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared ESLint configuration for server/gitrest packages.
 *
 * This module re-exports the base config from routerlicious to avoid duplication.
 * Gitrest packages are server-side Node.js services with similar requirements.
 */

// Re-export the routerlicious base config since gitrest has similar requirements
export { baseConfig, recommendedConfig } from "../routerlicious/eslint.config.base.mts";
