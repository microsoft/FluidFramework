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
export interface ISharedTreeEditor {
	/**
	 * An object with methods to edit the schema of the SharedTree.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	schema: ISchemaEditor;

	/**
	 * An object with methods to edit the tree data in the SharedTree.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	data: IDefaultEditBuilder;
}

/**
 * Implementation of {@link IDefaultEditBuilder} based on the default set of supported field kinds.
 * @sealed
 */
export class SharedTreeEditBuilder implements ChangeFamilyEditor, ISharedTreeEditor {
	private readonly schemaEditor: SchemaEditor;
	private readonly dataEditor: DefaultEditBuilder;

	public constructor(
		schemaChangeFamily: SchemaChangeFamily,
		modularChangeFamily: ModularChangeFamily,
		changeReceiver: (change: SharedTreeChange) => void,
	) {
		this.schemaEditor = new SchemaEditor(schemaChangeFamily, (change) =>
			changeReceiver({ schemaChange: change }),
		);
		this.dataEditor = new DefaultEditBuilder(modularChangeFamily, (change) =>
			changeReceiver({ modularChange: change }),
		);
	}

	public enterTransaction(): void {
		this.dataEditor.enterTransaction();
	}
	public exitTransaction(): void {
		this.dataEditor.exitTransaction();
	}

	public get schema(): ISchemaEditor {
		return this.schemaEditor;
	}

	public get data(): IDefaultEditBuilder {
		return this.dataEditor;
	}
}
