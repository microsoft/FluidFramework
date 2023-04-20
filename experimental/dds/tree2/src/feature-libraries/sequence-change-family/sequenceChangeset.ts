/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, makeCodecFamily, makeValueCodec } from "../../codec";
import { Transposed as T } from "./changeset";

export type SequenceChangeset = T.LocalChangeset;

export const sequenceChangeCodecs: ICodecFamily<SequenceChangeset> = makeCodecFamily([
	[0, makeValueCodec<SequenceChangeset>()],
]);
