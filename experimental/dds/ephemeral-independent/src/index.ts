/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	ClientId,
	IndependentDatastoreHandle,
	IndependentDirectory,
	IndependentDirectoryMethods,
	IndependentDirectoryNode,
	IndependentDirectoryNodeSchema,
	IndependentDirectoryPaths,
	IndependentValue,
	IndependentValueBrand,
	ManagerFactory,
	RoundTrippable,
} from "./types.js";

export { EphemeralIndependentDirectory } from "./independentDirectory/index.js";

export {
	Latest,
	type LatestValueClientData,
	type LatestValueData,
	type LatestValueManagerEvents,
	type LatestValueManager,
	type LatestValueMetadata,
} from "./latestValueManager.js";
