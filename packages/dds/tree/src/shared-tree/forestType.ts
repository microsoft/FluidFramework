/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import type { IEditableForest, TreeStoredSchemaSubscription } from "../core/index.js";
import type { IncrementalEncodingPolicy } from "../feature-libraries/index.js";
import type { Breakable } from "../util/index.js";

import type {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	ForestTypeExpensiveDebug,
} from "./forestTypeExpensiveDebug.js";
import type {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	ForestTypeOptimized,
} from "./forestTypeOptimized.js";
import type {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	ForestTypeReference,
} from "./forestTypeReference.js";

/**
 * Used to distinguish between different forest types.
 * @remarks
 * The forest is the internal data structure that stores all trees for a view or branch.
 * Forest types have the same behavior, but they can differ in performance and debuggability.
 *
 * Current options are {@link ForestTypeReference}, {@link ForestTypeOptimized}, and {@link ForestTypeExpensiveDebug}.
 *
 * Forest provider implementations are in separate modules so a bundler can remove providers that an application does not import.
 * @sealed @beta
 */
export interface ForestType extends ErasedType<"ForestType"> {}

type ForestFactory = (
	breaker: Breakable,
	schema: TreeStoredSchemaSubscription,
	idCompressor: IIdCompressor,
	shouldEncodeIncrementally: IncrementalEncodingPolicy,
) => IEditableForest;

/**
 * Creates a forest type from its factory.
 */
export function toForestType(factory: ForestFactory): ForestType {
	return factory as unknown as ForestType;
}

/**
 * Builds a forest of the requested type.
 */
export function buildConfiguredForest(
	breaker: Breakable,
	factory: ForestType,
	schema: TreeStoredSchemaSubscription,
	idCompressor: IIdCompressor,
	shouldEncodeIncrementally: IncrementalEncodingPolicy,
): IEditableForest {
	return (factory as unknown as ForestFactory)(
		breaker,
		schema,
		idCompressor,
		shouldEncodeIncrementally,
	);
}
