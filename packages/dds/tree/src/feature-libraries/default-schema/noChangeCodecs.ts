/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, makeCodecFamily, unitCodec } from "../../codec/index.js";
import { FieldChangeEncodingContext } from "../index.js";

export const noChangeCodecFamily: ICodecFamily<0, FieldChangeEncodingContext> = makeCodecFamily<
	0,
	FieldChangeEncodingContext
>([[0, unitCodec]]);
