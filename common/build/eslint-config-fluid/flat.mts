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

import { baseConfig } from "./library/configs/base.mjs";
import { sharedConfigs } from "./library/configs/overrides.mjs";
import {
	fullRecommendedConfig,
	fullStrictBiomeConfig,
	fullStrictConfig,
} from "./library/configs/factory.mjs";

const base = [...baseConfig, ...sharedConfigs] as const;
const recommended = [...fullRecommendedConfig] as const;
const strict = [...fullStrictConfig] as const;
const strictBiome = [...fullStrictBiomeConfig] as const;

export { base, recommended, strict, strictBiome };

/**
 * Re-exported building blocks for downstream configs that need to extend, rather than
 * replace, Fluid's shared rule options.
 *
 * @remarks
 * ESLint replaces (rather than merges) the options of a rule when multiple configs in the
 * resolved chain set it. A downstream config that sets `no-restricted-syntax` therefore needs
 * to re-include Fluid's base selectors to avoid silently dropping them. Spread
 * {@link restrictedSyntax} into your own selector list, e.g.
 * `"no-restricted-syntax": ["error", ...restrictedSyntax, myExtraSelector]`.
 */
export { restrictedSyntax } from "./library/constants.mjs";
