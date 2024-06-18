/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { RuntimeAttributor, createRuntimeAttributor } from "./runtimeAttributor.js";
export { enableOnNewFileKey, attributorTreeName } from "./utils.js";
export { type IProvideRuntimeAttributor, type IRuntimeAttributor } from "./interfaces.js";
export { MutableStringInterner, InternedStringId, StringInterner } from "./stringInterner.js";
export { makeLZ4Encoder } from "./lz4Encoder.js";
export {
	AttributorSerializer,
	chain,
	deltaEncoder,
	SerializedAttributor,
	Encoder,
	TimestampEncoder,
	IAttributorSerializer,
} from "./encoders.js";
export { type IAttributor, Attributor, OpStreamAttributor } from "./attributor.js";
