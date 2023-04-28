/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, requireAssignableTo } from "../../util";
import {
	FieldSchema,
	LocalFieldKey,
	TreeSchema,
	TreeSchemaIdentifier,
	SchemaData,
	GlobalFieldKey,
	Adapters,
	ViewSchemaData,
	AdaptedViewSchema,
	Compatibility,
	FieldAdapter,
	SchemaDataAndPolicy,
	SchemaPolicy,
	Named,
	ValueSchema,
} from "../../core";
import { FieldKind, FullSchemaPolicy } from "./fieldKind";
import { allowsRepoSuperset, isNeverTree } from "./comparison";

/**
 * A collection of View information for schema, including policy.
 */
export class ViewSchema extends ViewSchemaData<FullSchemaPolicy> {
	public constructor(
		policy: FullSchemaPolicy,
		adapters: Adapters,
		public readonly schema: ViewSchemaCollection,
	) {
		super(policy, adapters);
	}

	/**
	 * Determines the compatibility of a stored document
	 * (based on its stored schema) with a viewer (based on its view schema).
	 *
	 * Adapters can be provided to handle differences between the two schema.
	 * Adapters should only use to types in the `view` SchemaRepository.
	 *
	 * TODO: this API violates the parse don't validate design philosophy.
	 * It should be wrapped with (or replaced by) a parse style API.
	 */
	public checkCompatibility(stored: SchemaData): {
		read: Compatibility;
		write: Compatibility;
		writeAllowingStoredSchemaUpdates: Compatibility;
	} {
		const adapted = this.adaptRepo(stored);

		const read = allowsRepoSuperset(this.policy, stored, this.schema)
			? Compatibility.Compatible
			: allowsRepoSuperset(this.policy, adapted.adaptedForViewSchema, this.schema)
			? Compatibility.RequiresAdapters
			: Compatibility.Incompatible;
		// TODO: Extract subset of adapters that are valid to use on stored
		// TODO: separate adapters from schema updates
		const write = allowsRepoSuperset(this.policy, this.schema, stored)
			? Compatibility.Compatible
			: allowsRepoSuperset(this.policy, this.schema, adapted.adaptedForViewSchema)
			? // TODO: IThis assumes adapters are bidirectional.
			  Compatibility.RequiresAdapters
			: Compatibility.Incompatible;

		// TODO: compute this properly (and maybe include the set of schema changes needed for it?).
		// Maybe updates would happen lazily when needed to store data?
		// When willingness to updates can avoid need for some adapters,
		// how should it be decided if the adapter should be used to avoid the update?
		// TODO: is this case actually bi-variant, making this correct if we did it for each schema independently?
		let writeAllowingStoredSchemaUpdates =
			// TODO: This should consider just the updates needed
			// (ex: when view covers a subset of stored after stored has a update to that subset).
			allowsRepoSuperset(this.policy, stored, this.schema)
				? Compatibility.Compatible
				: // TODO: this assumes adapters can translate in both directions. In general this will not be true.
				// TODO: this also assumes that schema updates to the adapted repo would translate to
				// updates on the stored schema, which is also likely untrue.
				allowsRepoSuperset(this.policy, adapted.adaptedForViewSchema, this.schema)
				? Compatibility.RequiresAdapters // Requires schema updates. TODO: consider adapters that can update writes.
				: Compatibility.Incompatible;

		// Since the above does not consider partial updates,
		// we can improve the tolerance a bit by considering the op-op update:
		writeAllowingStoredSchemaUpdates = Math.max(writeAllowingStoredSchemaUpdates, write);

		return { read, write, writeAllowingStoredSchemaUpdates };
	}

	/**
	 * Compute a schema that `original` could be viewed as using adapters as needed.
	 *
	 * TODO: have a way for callers to get invalidated on schema updates.
	 * Maybe pass in StoredSchemaRepository and optional ObservingDependent?
	 */
	public adaptRepo(stored: SchemaData): AdaptedViewSchema {
		// Sanity check on adapters:
		// it's probably a bug it they use the never types,
		// since there never is a reason to have a never type as an adapter input,
		// and its impossible for an adapter to be correctly implemented if its output type is never
		// (unless its input is also never).
		for (const adapter of this.adapters?.tree ?? []) {
			if (
				isNeverTree(
					this.policy,
					this.schema,
					this.schema.treeSchema.get(adapter.output) ?? this.policy.defaultTreeSchema,
				)
			) {
				fail("tree adapter for stored adapter.output should not be never");
			}
		}
		const adapted = {
			globalFieldSchema: new Map<GlobalFieldKey, FieldSchema>(),
			treeSchema: new Map<TreeSchemaIdentifier, TreeSchema>(),
		};
		for (const [key, schema] of stored.globalFieldSchema) {
			const adaptedField = this.adaptField(schema, this.adapters.fieldAdapters?.get(key));
			adapted.globalFieldSchema.set(key, adaptedField);
		}
		for (const [key, schema] of stored.treeSchema) {
			const adapatedTree = this.adaptTree(schema);
			adapted.treeSchema.set(key, adapatedTree);
		}

		// TODO: subset these adapters to the ones that were needed/used.
		return new AdaptedViewSchema(this.adapters, adapted);
	}

	/**
	 * Adapt original such that it allows member types which can be adapted to its specified types.
	 */
	private adaptField(original: FieldSchema, adapter: FieldAdapter | undefined): FieldSchema {
		if (original.types) {
			const types: Set<TreeSchemaIdentifier> = new Set(original.types);
			for (const treeAdapter of this.adapters?.tree ?? []) {
				if (original.types.has(treeAdapter.input)) {
					types.delete(treeAdapter.input);
					types.add(treeAdapter.output);
				}
			}

			return (
				adapter?.convert?.({ kind: original.kind, types }) ?? { kind: original.kind, types }
			);
		}
		return adapter?.convert?.(original) ?? original;
	}

	private adaptTree(original: TreeSchema): TreeSchema {
		const localFields: Map<LocalFieldKey, FieldSchema> = new Map();
		for (const [key, schema] of original.localFields) {
			// TODO: support missing field adapters for local fields.
			localFields.set(key, this.adaptField(schema, undefined));
		}
		return { ...original, localFields };
	}
}

// TODO: Separate this from TreeSchema, adding more data.
/**
 * @alpha
 */
export interface TreeViewSchema extends TreeSchema, Sourced {
	/**
	 * Schema for fields with keys scoped to this TreeSchema.
	 *
	 * This refers to the FieldSchema directly
	 * (as opposed to just supporting FieldSchemaIdentifier and having a central FieldKey -\> FieldSchema map).
	 * This allows os short friendly field keys which can ergonomically used as field names in code.
	 * It also interoperates well with extraLocalFields being used as a map with arbitrary data as keys.
	 */
	readonly localFields: ReadonlyMap<LocalFieldKey, FieldViewSchema>;

	/**
	 * Schema for fields with keys scoped to the whole document.
	 *
	 * Having a centralized map indexed by FieldSchemaIdentifier
	 * can be used for fields which have the same meaning in multiple places,
	 * and simplifies document root handling (since the root can just have a special `FieldSchemaIdentifier`).
	 *
	 * TODO: maybe reference these directly (lambda wrapped) and not by key.
	 */
	readonly globalFields: ReadonlySet<GlobalFieldKey>;

	/**
	 * Constraint for local fields not mentioned in `localFields`.
	 *
	 * Allows using using the local fields as a map, with the keys being
	 * LocalFieldKeys and the values being constrained by this FieldSchema.
	 *
	 * To forbid this map like usage, use {@link emptyField} here.
	 *
	 * Usually `FieldKind.Value` should NOT be used here
	 * since no nodes can ever be in schema are in schema if you use `FieldKind.Value` here
	 * (that would require infinite children).
	 * This pattern, which produces a schema which can never be met, is used by {@link neverTree},
	 * and can be useful in special cases (like a default stored schema when none is specified).
	 */
	readonly extraLocalFields: FieldViewSchema;

	/**
	 * If true,
	 * GlobalFieldKeys other than the ones listed above in globalFields may be used to store data on this tree node.
	 * Such fields must still be in schema with their global FieldSchema.
	 *
	 * This allows for the "augmentations" pattern where
	 * users can attach information they understand to any tree without risk of name collisions.
	 * This is not the only way to do "augmentations":
	 * another approach is for the applications that wish to add them to include
	 * the augmentation in their view schema on the nodes they with to augment,
	 * and update the stored schema to permit them as needed.
	 *
	 * This schema system could work with extraGlobalFields unconditionally on
	 * (justified as allowing augmentations everywhere though requiring stored schema changes),
	 * or unconditionally off (requiring augmentations to sometimes update stored schema).
	 * Simplifying this system to not have extraGlobalFields and default it to on or off is a design decision which
	 * doesn't impact the rest of this system,
	 * and thus is being put off for now.
	 *
	 * Unlike with extraLocalFields, only non-empty global fields have to be in schema here,
	 * so the existence of a global value field does not immediately make all TreeSchema permitting extra global fields
	 * out of schema if they are missing said field.
	 *
	 * TODO: this approach is inconsistent and should likely be redesigned
	 * so global and local extra fields work more similarly.
	 */
	readonly extraGlobalFields: boolean;

	/**
	 * There are several approaches for how to store actual data in the tree
	 * (special node types, special field contents, data on nodes etc.)
	 * as well as several options about how the data should be modeled at this level
	 * (byte sequence? javascript type? json?),
	 * as well as options for how much of this would be exposed in the schema language
	 * (ex: would all nodes with values be special built-ins, or could any schema add them?)
	 *
	 * A simple easy to do in javascript approach is taken here:
	 * this is not intended to be a suggestion of what approach to take, or what to expose in the schema language.
	 * This is simply one approach that can work for modeling them in the internal schema representation.
	 */
	readonly value: ValueSchema;
}

/**
 * All policy for a specific field kind,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @alpha
 */
// TODO: maybe reference nodes directly (lambda wrapped) instead of by identifier.
export interface FieldViewSchema<Kind extends FieldKind = FieldKind> extends FieldSchema, Sourced {
	readonly kind: Kind;
}

/**
 * Schema data that can be be used to view a document.
 * @alpha
 */
export interface ViewSchemaCollection {
	readonly globalFieldSchema: ReadonlyMap<GlobalFieldKey, FieldViewSchema>;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeViewSchema>;
	readonly policy: SchemaPolicy;
	readonly adapters: Adapters;
}

{
	// ViewSchemaCollection can't extend the SchemaDataAndPolicy interface due to odd TypeScript issues,
	// but want to be compatible with it, so check that here:
	type _test = requireAssignableTo<ViewSchemaCollection, SchemaDataAndPolicy>;
}

/**
 * Record where a schema came from for error reporting purposes.
 */
export interface Sourced {
	readonly builder: Named<string>;
}
