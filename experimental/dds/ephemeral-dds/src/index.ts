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

// eslint-disable-next-line import/no-internal-modules
export { EphemeralIndependentDirectory } from "./independentDirectory/index.js";

export {
	Latest,
	type LatestValueManagerEvents,
	type LatestValueManager,
} from "./latestValueManager.js";
