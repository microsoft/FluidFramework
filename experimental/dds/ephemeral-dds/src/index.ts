/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	ClientId,
	IndependentDirectory,
	IndependentDirectoryMethods,
	IndependentDirectoryNode,
	IndependentDirectoryNodeSchema,
	IndependentDirectoryPaths,
	ManagerFactory,
	RoundTrippable,
} from "./types.js";

export { EphemeralIndependentDirectory } from "./independentDirectory/index.js";

export type { IndependentDatastoreHandle } from "./independentDatastore.js";
export type { IndependentValue } from "./independentValue.js";

export {
	Latest,
	type LatestValueManagerEvents,
	type LatestValueManager,
} from "./latestValueManager.js";
