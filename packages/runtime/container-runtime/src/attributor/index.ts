/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { type IAttributor } from "./attributor.js";
export { RuntimeAttributor } from "./runtimeAttributor.js";
export {
	type IProvideRuntimeAttributor,
	enableOnNewFileKey,
	type IRuntimeAttributor,
	attributorTreeName,
} from "./utils.js";
