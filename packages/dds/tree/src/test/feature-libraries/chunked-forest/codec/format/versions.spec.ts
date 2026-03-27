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
	isAssignableTo,
	requireTrue,
	type areSafelyAssignable,
	type requireAssignableTo,
	type requireFalse,
} from "../../../../../util/index.js";

// Validate assignability of the various formats is working as expected.
// This is to ensure that code using the TypeScript types for type safety is being constrained as expected.
// This is not quite as trivial as it should be since the way we model unions is prone to this kind of issue,
// so this validates that the fix for that (the Never added in EncodedChunkShapeV1) is working as intended.

// Validated the documented properties of EncodedFieldBatchV1OrV2 and
// EncodedFieldBatchV1AndV2 regarding what types they are equivalent to.
allowUnused<requireTrue<areSafelyAssignable<EncodedFieldBatchV2, EncodedFieldBatchV1OrV2>>>();
allowUnused<requireTrue<areSafelyAssignable<EncodedFieldBatchV1, EncodedFieldBatchV1AndV2>>>();

// Validate the "Never" in V1's shape is working to ensure V2 is NOT assignable to V1.
// This is important since V2 supports incremental chunk shapes that V1 does not support.
allowUnused<requireFalse<isAssignableTo<EncodedFieldBatchV2, EncodedFieldBatchV1>>>();
allowUnused<requireFalse<isAssignableTo<EncodedFieldBatchV2, EncodedFieldBatchV1AndV2>>>();

// V1 is assignable to V2: V2 is backward-compatible and can represent all V1 data.
allowUnused<requireAssignableTo<EncodedFieldBatchV1, EncodedFieldBatchV2>>();
