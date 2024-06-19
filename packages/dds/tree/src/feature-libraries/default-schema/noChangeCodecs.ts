/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICodecFamily, makeCodecFamily, unitCodec } from "../../codec/index.js";
import type { FieldChangeEncodingContext } from "../index.js";

export const noChangeCodecFamily: ICodecFamily<0, FieldChangeEncodingContext> =
	makeCodecFamily<0, FieldChangeEncodingContext>([[1, unitCodec]]);
