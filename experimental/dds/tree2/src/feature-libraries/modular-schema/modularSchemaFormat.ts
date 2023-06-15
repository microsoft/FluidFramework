/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { RevisionTagSchema } from "../../core";
import { brandedNumberType } from "../../util";
import { ChangesetLocalId } from "./modularSchemaTypes";

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
	{ additionalProperties: false },
);
