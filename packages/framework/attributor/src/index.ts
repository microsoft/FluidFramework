/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { type IAttributor } from "./attributor.js";
export {
	type IProvideRuntimeAttributor,
	IRuntimeAttributor,
	attributorDataStoreAlias,
	enableOnNewFileKey,
} from "./attributorContracts.js";
export { getRuntimeAttributor, mixinAttributor } from "./mixinAttributor.js";
