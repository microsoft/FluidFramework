/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { type Unenforced } from "./typedTreeSchema.js";

export {
	type FlexList,
	markEager,
	type LazyItem,
	isLazy,
	type FlexListToUnion,
	type ExtractItemType,
	normalizeFlexListEager,
} from "./flexList.js";
