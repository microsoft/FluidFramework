/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ArrayNodeCustomizableSchema,
	type ArrayNodePojoEmulationSchema,
	ArrayNodeSchema,
	arraySchema,
	asIndex,
	isArrayNodeSchema,
	IterableTreeArrayContent,
	TreeArrayNode,
	type ReadonlyArrayNode,
} from "./array/index.js";

export {
	isMapNodeSchema,
	type MapNodeCustomizableSchema,
	type MapNodeInsertableData,
	type MapNodePojoEmulationSchema,
	MapNodeSchema,
	mapSchema,
	type TreeMapNode,
} from "./map/index.js";
