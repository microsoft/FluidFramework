/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamilyEditor, TreeStoredSchema } from "../core/index.js";
import {
	DefaultEditBuilder,
	IDefaultEditBuilder,
	ModularChangeFamily,
} from "../feature-libraries/index.js";
import { SharedTreeChange } from "./sharedTreeChangeTypes.js";

/**
 * Editor for schema changes.
 * The only currently supported operation is to replace the stored schema.
 * @internal
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
 * @internal
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
		private readonly changeReceiver: (change: SharedTreeChange) => void,
	) {
		super(modularChangeFamily, (change) =>
			changeReceiver({
				changes: [{ type: "data", innerChange: change }],
			}),
		);

		this.schema = {
			setStoredSchema: (oldSchema, newSchema) => {
				this.changeReceiver({
					changes: [
						{
							type: "schema",
							innerChange: { schema: { new: newSchema, old: oldSchema } },
						},
					],
				});
			},
		};
	}
}
