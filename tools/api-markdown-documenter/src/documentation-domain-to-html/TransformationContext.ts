/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultConsoleLogger, type Logger } from "../Logging.js";
import type { TextFormatting } from "../documentation-domain/index.js";

import {
	defaultTransformations,
	type TransformationConfig,
	type Transformations,
} from "./configuration/index.js";

/**
 * Context passed to recursive {@link DocumentationNode} transformations.
 *
 * @public
 */
export interface TransformationContext extends TextFormatting {
	/**
	 * Contextual heading level.
	 *
	 * @remarks
	 *
	 * Will automatically increment based on {@link SectionNode}s encountered, such that heading
	 * levels can be increased automatically based on content hierarchy.
	 */
	readonly headingLevel: number;

	/**
	 * Complete set of transformations (includes defaults and user-specified).
	 */
	readonly transformations: Transformations;

	/**
	 * Receiver of system log data.
	 */
	readonly logger: Logger;
}

/**
 * Constructs a {@link TransformationContext} using provided optional parameters, filling in the rest with
 * system defaults.
 */
export function createTransformationContext(
	config: TransformationConfig | undefined,
): TransformationContext {
	const headingLevel = config?.startingHeadingLevel ?? 1;
	const transformations: Transformations = {
		...defaultTransformations,
		...config?.customTransformations,
	};
	const formatting = config?.rootFormatting;
	return {
		headingLevel,
		transformations,
		logger: config?.logger ?? defaultConsoleLogger,
		...formatting,
	};
}
