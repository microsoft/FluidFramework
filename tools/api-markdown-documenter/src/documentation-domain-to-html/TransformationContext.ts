/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConfigurationBase } from "../ConfigurationBase.js";
import { defaultConsoleLogger } from "../Logging.js";
import {
	defaultTransformations,
	type TransformationConfig,
	type Transformations,
} from "./configuration/index.js";

/**
 * Context passed down during recursive {@link DocumentationNode} rendering.
 *
 * @alpha
 */
export interface TransformationContext extends ConfigurationBase {
	/**
	 * Contextual heading level.
	 *
	 * @remarks
	 *
	 * Will automatically increment based on {@link SectionNode}s encountered, such that heading
	 * levels can be increased automatically based on content hierarchy.
	 */
	headingLevel: number;

	/**
	 * Complete set of transformations (includes defaults and user-specified).
	 */
	readonly transformations: Transformations;
}

/**
 * Constructs a {@link TransformationContext} using provided optional parameters, and filling in the rest with
 * system defaults.
 */
export function createTransformationContext(
	config: Partial<TransformationConfig> | undefined,
): TransformationContext {
	const headingLevel = config?.startingHeadingLevel ?? 1;
	const transformations: Transformations = {
		...defaultTransformations,
		...config?.customTransformations,
	};
	return {
		headingLevel,
		transformations,
		logger: config?.logger ?? defaultConsoleLogger,
	};
}
