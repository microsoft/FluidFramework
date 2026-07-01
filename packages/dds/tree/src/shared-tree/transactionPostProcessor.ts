/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeProcessor } from "../shared-tree-core/index.js";
import type { TransactionPostProcessor } from "../simple-tree/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";

/**
 * The internal representation of a {@link TransactionPostProcessor}: a {@link ChangeProcessor} over
 * {@link SharedTreeChange}.
 * @remarks This is the (non-type-erased) form used internally to apply a transaction's post-processor.
 */
export type TransactionPostProcessorInternal = ChangeProcessor<SharedTreeChange>;

/**
 * Type-erases an internal {@link TransactionPostProcessorInternal | change processor} as a public
 * {@link TransactionPostProcessor}.
 * @remarks This is the only sanctioned way to produce a {@link TransactionPostProcessor}. The inverse conversion is
 * {@link extractTransactionChangeProcessor}.
 */
export function createTransactionPostProcessor(
	processor: TransactionPostProcessorInternal,
): TransactionPostProcessor {
	return processor as unknown as TransactionPostProcessor;
}

/**
 * Recovers the internal {@link TransactionPostProcessorInternal | change processor} from a type-erased
 * {@link TransactionPostProcessor}.
 * @remarks This reverses {@link createTransactionPostProcessor}. It is assumed that only code which produces these
 * type-erased handles performs this conversion, allowing them to be treated as opaque elsewhere.
 */
export function extractTransactionChangeProcessor(
	postProcessor: TransactionPostProcessor | undefined,
): TransactionPostProcessorInternal | undefined {
	return postProcessor as unknown as TransactionPostProcessorInternal;
}
