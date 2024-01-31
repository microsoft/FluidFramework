/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export { Attributor, type IAttributor, OpStreamAttributor } from "./attributor";
export {
	createRuntimeAttributor,
	enableOnNewFileKey,
	type IProvideRuntimeAttributor,
	IRuntimeAttributor,
	mixinAttributor,
} from "./mixinAttributor";
