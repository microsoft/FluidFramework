/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICodecFamily, makeCodecFamily, unitCodec } from "../../codec/index.js";
import type {
	FieldChangeEncodingContext,
	FieldChangeDecodingContext,
} from "../modular-schema/index.js";

export const noChangeCodecFamily: ICodecFamily<
	0,
	FieldChangeEncodingContext,
	FieldChangeDecodingContext
> = makeCodecFamily<0, FieldChangeEncodingContext, FieldChangeDecodingContext>([
	[1, unitCodec],
]);
