/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Native ESLint 9 flat config implementation.
 *
 * This configuration imports plugins directly (without FlatCompat) and uses a modular
 * structure for maintainability. The config is split into:
 *
 * - lib/constants.mts: Shared constants (ignores, file patterns, import restrictions)
 * - lib/settings.mts: Plugin settings (import-x, jsdoc)
 * - lib/rules/: Rule definitions organized by config level
 * - lib/configs/: Config builders and shared overrides
 *
 * @see lib/configs/factory.mts for the main config assembly logic
 */

import {
	fullMinimalDeprecatedConfig,
	fullRecommendedConfig,
	fullStrictBiomeConfig,
	fullStrictConfig,
} from "./library/configs/factory.mjs";

const minimalDeprecated = [...fullMinimalDeprecatedConfig] as const;
const recommended = [...fullRecommendedConfig] as const;
const strict = [...fullStrictConfig] as const;
const strictBiome = [...fullStrictBiomeConfig] as const;

export { recommended, strict, minimalDeprecated, strictBiome };
