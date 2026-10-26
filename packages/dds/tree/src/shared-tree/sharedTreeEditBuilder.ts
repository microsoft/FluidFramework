/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	FieldKinds,
} from "../feature-libraries/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { CodecWriteOptions } from "../codec/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { ObjectNodeStoredSchema } from "../core/index.js";
import {
	MessageFormatVersion,
	EditManagerFormatVersion,
	messageCodecName,
	editManagerCodecName,
} from "../shared-tree-core/index.js";

/**
 * Checks that a counter-bearing schema can be written to both messages and persisted history.
 * @param schema - The stored schema being installed or loaded, including currently unused definitions.
 * @param options - Codec overrides; both message and edit-manager codecs must select their counter format.
 * @throws A usage error if the schema contains counters but either override is absent or incompatible.
 * @remarks
 * Used before schema edits and after loading stored schema so unsupported counter content is rejected
 * even when no counter operation has yet been submitted.
 * Schemas without counters are unaffected; this does not validate root placement or allowed leaf types.
 */
export function validateCounterSchemaFormats(
	schema: TreeStoredSchema,
	options: Pick<CodecWriteOptions, "writeVersionOverrides">,
): void {
	const hasCounter =
		schema.rootFieldSchema.kind === FieldKinds.counter.identifier ||
		[...schema.nodeSchema.values()].some(
			(node) =>
				node instanceof ObjectNodeStoredSchema &&
				[...node.objectNodeFields.values()].some(
					(field) => field.kind === FieldKinds.counter.identifier,
				),
		);
	const overrides = options.writeVersionOverrides;
	if (
		hasCounter &&
		(overrides?.get(messageCodecName) !== MessageFormatVersion.counter ||
			overrides.get(editManagerCodecName) !== EditManagerFormatVersion.counter)
	) {
		throw new UsageError(
			"Counter fields require explicit experimental message and history codec overrides",
		);
	}
}

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
	) {
		super(
			modularChangeFamily,
			mintRevisionTag,
			(taggedChange) =>
				changeReceiver({
					...taggedChange,
					change: { changes: [{ type: "data", innerChange: taggedChange.change }] },
				}),
			modularChangeFamily.codecOptions,
		);

		this.schema = {
			setStoredSchema: (oldSchema, newSchema) => {
				validateCounterSchemaFormats(newSchema, modularChangeFamily.codecOptions);
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
