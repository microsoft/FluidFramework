/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { ICodecFamily, makeCodecFamily, makeValueCodec } from "../../codec";
import { Transposed as T } from "./changeset";

export type SequenceChangeset = T.LocalChangeset;

export const sequenceChangeCodecs: ICodecFamily<SequenceChangeset> = makeCodecFamily([
	// TODO: This sequence field encoding is slotted for deletion. No effort has been made to
	// construct its schema.
	[0, makeValueCodec(Type.Any())],
]);
