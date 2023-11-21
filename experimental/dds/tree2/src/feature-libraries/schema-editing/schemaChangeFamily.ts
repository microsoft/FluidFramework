/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, ICodecOptions } from "../../codec";
import {
	ChangeFamily,
	ChangeRebaser,
	TaggedChange,
	EditBuilder,
	Delta,
	TreeStoredSchema,
	emptyDelta,
} from "../../core";
import { makeSchemaChangeCodecFamily } from "./schemaChangeCodecs";
import { SchemaChange } from "./schemaChangeTypes";

/**
 * The editing affordances for changing the schema of a SharedTree.
 * @alpha
 */
export interface ISchemaEditor {
	/**
	 * Updates the stored schema.
	 * @param schema - The new schema to apply.
	 * @alpha
	 */
	setStoredSchema(schema: TreeStoredSchema): void;
}

export class SchemaEditor extends EditBuilder<SchemaChange> implements ISchemaEditor {
	public setStoredSchema(schema: TreeStoredSchema): void {
		this.applyChange({ newSchema: schema });
	}
}

/**
 * Handles changes to the stored document schema.
 */
export class SchemaChangeFamily
	implements ChangeFamily<SchemaEditor, SchemaChange>, ChangeRebaser<SchemaChange>
{
	public readonly codecs: ICodecFamily<SchemaChange>;

	public constructor(codecOptions: ICodecOptions) {
		this.codecs = makeSchemaChangeCodecFamily(codecOptions);
	}

	public buildEditor(changeReceiver: (change: SchemaChange) => void): SchemaEditor {
		return new SchemaEditor(this, changeReceiver);
	}

	public compose(changes: TaggedChange<SchemaChange>[]): SchemaChange {
		// Schema changes overwrite each other, so composing multiple together doesn't really make sense; choose the last one.
		return changes[changes.length - 1].change;
	}

	public invert(change: TaggedChange<SchemaChange>, isRollback: boolean): SchemaChange {
		// The tag of the inverted revision can be used as a key in the schema store to lookup the previous schema
		return { newSchema: change.revision };
	}

	public rebase(change: SchemaChange, over: TaggedChange<SchemaChange>): SchemaChange {
		// For now, always "conflict" when attempting to rebase schema changes.
		return {};
	}

	public intoDelta(change: TaggedChange<SchemaChange>): Delta.Root {
		// TODO: This is correct, technically, since schema changes don't change the forest, but it's strange to require this to be implemented here.
		// TODO: does the forest need to be notified for chunking?
		return emptyDelta;
	}

	public get rebaser(): ChangeRebaser<SchemaChange> {
		return this;
	}
}
