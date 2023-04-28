/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnlySchema } from "../../util";

export const EncodedGenericChange = Type.Object({
	index: Type.Number({ minimum: 0 }),
	// Note: same composition pattern issue here as in default field kind encoding
	// TODO: this format needs more documentation (ideally in the form of more specific types).
	nodeChange: JsonCompatibleReadOnlySchema,
});
export type EncodedGenericChange = Static<typeof EncodedGenericChange>;

export const EncodedGenericChangeset = Type.Array(EncodedGenericChange);
export type EncodedGenericChangeset = Static<typeof EncodedGenericChangeset>;
