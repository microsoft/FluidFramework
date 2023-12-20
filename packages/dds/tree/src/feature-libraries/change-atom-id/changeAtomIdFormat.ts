/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, Type } from "@sinclair/typebox";
import { brandedNumberType } from "../../util";
import { RevisionTagSchema } from "../../core";
import { ChangesetLocalId } from "./changeAtomIdTypes";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

export const ChangesetLocalIdSchema = brandedNumberType<ChangesetLocalId>();

export const EncodedChangeAtomId = Type.Object(
	{
		/**
		 * Uniquely identifies the changeset within which the change was made.
		 */
		revision: Type.Optional(RevisionTagSchema),
		/**
		 * Uniquely identifies, in the scope of the changeset, the change made to the field.
		 */
		localId: ChangesetLocalIdSchema,
	},
	noAdditionalProps,
);
export type EncodedChangeAtomId = Static<typeof EncodedChangeAtomId>;
