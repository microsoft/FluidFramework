/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamilyEditor } from "../core";
import {
	DefaultEditBuilder,
	IDefaultEditBuilder,
	SchemaEditor,
	ISchemaEditor,
	ModularChangeFamily,
	SchemaChangeFamily,
} from "../feature-libraries";
import { SharedTreeChange } from "./sharedTreeChangeTypes";

/**
 * SharedTree editor for transactional tree data and schema changes.
 * @alpha
 */
export interface ISharedTreeEditor extends IDefaultEditBuilder {
	/**
	 * An object with methods to edit the schema of the SharedTree.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
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
	public readonly schemaEditor: SchemaEditor;

	public constructor(
		schemaChangeFamily: SchemaChangeFamily,
		modularChangeFamily: ModularChangeFamily,
		changeReceiver: (change: SharedTreeChange) => void,
	) {
		super(modularChangeFamily, (change) =>
			changeReceiver({ changes: [{ type: "data", change }] }),
		);
		this.schemaEditor = new SchemaEditor(schemaChangeFamily, (change) =>
			changeReceiver({ changes: [{ type: "schema", change }] }),
		);
	}

	public get schema(): ISchemaEditor {
		return this.schemaEditor;
	}
}
