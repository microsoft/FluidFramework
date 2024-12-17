/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { type IAttributor } from "./attributor.js";
export {
	getRuntimeAttributor,
	loadRuntimeWithAttribution,
} from "./mixinAttributor.js";
export {
	attributorDataStoreAlias,
	enableOnNewFileKey,
	type IProvideRuntimeAttributor,
	IRuntimeAttributor,
} from "./attributorContracts.js";
