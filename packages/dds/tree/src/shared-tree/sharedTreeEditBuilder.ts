/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import type {
	ChangeFamilyEditor,
	RevisionTag,
	TaggedChange,
	TreeStoredSchema,
} from "../core/index.js";
import {
	DefaultEditBuilder,
	type IDefaultEditBuilder,
	type ModularChangeFamily,
} from "../feature-libraries/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";

/**
 * Editor for schema changes.
 * The only currently supported operation is to replace the stored schema.
 */
export interface ISchemaEditor {
	/**
	 * Updates the stored schema.
	 * @param oldSchema - The schema being overwritten.
	 * @param newSchema - The new schema to apply.
	 */
	setStoredSchema(oldSchema: TreeStoredSchema, newSchema: TreeStoredSchema): void;
}

/**
 * SharedTree editor for transactional tree data and schema changes.
 */
export interface ISharedTreeEditor extends IDefaultEditBuilder {
	/**
	 * Editor for schema changes.
	 */
	schema: ISchemaEditor;
}

/**
 * Implementation of {@link IDefaultEditBuilder} based on the default set of supported field kinds.
 * @sealed
 */
export class SharedTreeEditBuilder
	extends DefaultEditBuilder
	implements ChangeFamilyEditor, ISharedTreeEditor
{
	public readonly schema: ISchemaEditor;

	public constructor(
		modularChangeFamily: ModularChangeFamily,
		mintRevisionTag: () => RevisionTag,
		private readonly changeReceiver: (change: TaggedChange<SharedTreeChange>) => void,
		idCompressor?: IIdCompressor,
	) {
		super(
			modularChangeFamily,
			mintRevisionTag,
			(taggedChange) =>
				changeReceiver({
					...taggedChange,
					change: { changes: [{ type: "data", innerChange: taggedChange.change }] },
				}),
			idCompressor,
		);

		this.schema = {
			setStoredSchema: (oldSchema, newSchema) => {
				this.changeReceiver({
					revision: mintRevisionTag(),
					change: {
						changes: [
							{
								type: "schema",
								innerChange: {
									schema: { new: newSchema, old: oldSchema },
									isInverse: false,
								},
							},
						],
					},
				});
			},
		};
	}
}
