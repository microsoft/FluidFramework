/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BooleanView } from "./Boolean.js";
import { EnumView } from "./Enum.js";
import { NumberView } from "./Number.js";
import { StringView } from "./String.js";

export { BooleanView, StringView, NumberView, EnumView };

export const typeToViewMap = {
	Bool: BooleanView,
	String: StringView,
	enum: EnumView,

	Float32: NumberView,
	Float64: NumberView,
	Int16: NumberView,
	Int32: NumberView,
	Int64: NumberView,
	Int8: NumberView,
	Uint16: NumberView,
	Uint32: NumberView,
	Uint64: NumberView,
	Uint8: NumberView,
};
