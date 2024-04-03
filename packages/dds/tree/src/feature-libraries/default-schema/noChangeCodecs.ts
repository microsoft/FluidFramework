/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, makeCodecFamily, unitCodec } from "../../codec/index.js";
import { ChangeEncodingContext } from "../../core/index.js";

export const noChangeCodecFamily: ICodecFamily<0, ChangeEncodingContext> = makeCodecFamily<
	0,
	ChangeEncodingContext
>([[0, unitCodec]]);
