/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	EncodedFieldBatchV1OrV2,
	EncodedFieldBatchV1AndV2,
	EncodedFieldBatchV2,
	EncodedFieldBatchV1,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../../feature-libraries/chunked-forest/codec/format/versions.js";
import { allowUnused } from "../../../../../simple-tree/index.js";
import {
	requireTrue,
	type areSafelyAssignable,
	type requireAssignableTo,
	type requireFalse,
} from "../../../../../util/index.js";

// Validate assignability of the various formats is working a expected.
// This is to ensure that code using the TypeScript types for type safety is being constrained as expected.
// This is not quite as trivial as it should be since the way we model unions is prone to this kind of issue,
// so this validates that the fix for that (the Never added in EncodedChunkShapeV1) is working as intended.

allowUnused<requireTrue<areSafelyAssignable<EncodedFieldBatchV2, EncodedFieldBatchV1OrV2>>>();
allowUnused<requireTrue<areSafelyAssignable<EncodedFieldBatchV1, EncodedFieldBatchV1AndV2>>>();

allowUnused<requireFalse<areSafelyAssignable<EncodedFieldBatchV1, EncodedFieldBatchV1OrV2>>>();
allowUnused<
	requireFalse<areSafelyAssignable<EncodedFieldBatchV2, EncodedFieldBatchV1AndV2>>
>();

allowUnused<requireAssignableTo<EncodedFieldBatchV1, EncodedFieldBatchV2>>();
