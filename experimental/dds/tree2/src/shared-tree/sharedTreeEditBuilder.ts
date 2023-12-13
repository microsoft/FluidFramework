/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamilyEditor, TreeStoredSchema } from "../core";
import { DefaultEditBuilder, IDefaultEditBuilder, ModularChangeFamily } from "../feature-libraries";
import { SharedTreeChange } from "./sharedTreeChangeTypes";

/**
 * SharedTree editor for transactional tree data and schema changes.
 * @alpha
 */
export interface ISharedTreeEditor extends IDefaultEditBuilder {
	/**
	 * Updates the stored schema.
	 * @param oldSchema - The schema being overwritten.
	 * @param newSchema - The new schema to apply.
	 * @alpha
	 */
	setStoredSchema(oldSchema: TreeStoredSchema, newSchema: TreeStoredSchema): void;
}

/**
 * Implementation of {@link IDefaultEditBuilder} based on the default set of supported field kinds.
 * @sealed
 */
export class SharedTreeEditBuilder
	extends DefaultEditBuilder
	implements ChangeFamilyEditor, ISharedTreeEditor
{
	public constructor(
		modularChangeFamily: ModularChangeFamily,
		private readonly changeReceiver: (change: SharedTreeChange) => void,
	) {
		super(modularChangeFamily, (change) =>
			changeReceiver({
				changes: [{ type: "data", innerChange: change, isConflicted: false }],
			}),
		);
	}

	public setStoredSchema(oldSchema: TreeStoredSchema, newSchema: TreeStoredSchema): void {
		this.changeReceiver({
			changes: [
				{
					type: "schema",
					innerChange: { schema: { new: newSchema, old: oldSchema } },
					isConflicted: false,
				},
			],
		});
	}
}
