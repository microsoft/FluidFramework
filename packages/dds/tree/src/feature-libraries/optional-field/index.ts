/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type IRegisterMap,
	type OptionalFieldEditor,
	optionalChangeHandler,
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	RegisterMap,
} from "./optionalField.js";
export type {
	Move,
	OptionalChangeset,
	RegisterId,
} from "./optionalFieldChangeTypes.js";
export { makeOptionalFieldCodecFamily } from "./optionalFieldCodecs.js";
