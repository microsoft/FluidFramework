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
	 * @param newSchema - The new schema to apply.
	 * @param oldSchema - The schema being overwritten.
	 * @alpha
	 */
	setStoredSchema(newSchema: TreeStoredSchema, oldSchema: TreeStoredSchema): void;
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

	public setStoredSchema(newSchema: TreeStoredSchema, oldSchema: TreeStoredSchema): void {
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
