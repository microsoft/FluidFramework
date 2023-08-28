/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Named, fail } from "../../util";
import {
	FieldStoredSchema,
	FieldKey,
	TreeStoredSchema,
	TreeSchemaIdentifier,
	SchemaData,
	Adapters,
	AdaptedViewSchema,
	Compatibility,
} from "../../core";
import { FullSchemaPolicy, allowsRepoSuperset, isNeverTree } from "../modular-schema";
import { TypedSchemaCollection } from "./schemaBuilder";

/**
 * A collection of View information for schema, including policy.
 */
export class ViewSchema {
	public constructor(
		public readonly policy: FullSchemaPolicy,
		public readonly adapters: Adapters,
		public readonly schema: TypedSchemaCollection,
	) {}

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
			if (isNeverTree(this.policy, this.schema, this.schema.treeSchema.get(adapter.output))) {
				fail("tree adapter for stored adapter.output should not be never");
			}
		}

		const adapted = {
			rootFieldSchema: this.adaptField(stored.rootFieldSchema),
			treeSchema: new Map<TreeSchemaIdentifier, TreeStoredSchema>(),
		};

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
	private adaptField(original: FieldStoredSchema): FieldStoredSchema {
		if (original.types !== undefined) {
			const types: Set<TreeSchemaIdentifier> = new Set(original.types);
			for (const treeAdapter of this.adapters?.tree ?? []) {
				if (types.has(treeAdapter.input)) {
					types.delete(treeAdapter.input);
					types.add(treeAdapter.output);
				}
			}

			return { kind: original.kind, types };
		}
		return original;
	}

	private adaptTree(original: TreeStoredSchema): TreeStoredSchema {
		const structFields: Map<FieldKey, FieldStoredSchema> = new Map();
		for (const [key, schema] of original.structFields) {
			// TODO: support missing field adapters.
			structFields.set(key, this.adaptField(schema));
		}
		// Would be nice to use ... here, but some implementations can use properties as well as have extra fields,
		// so copying the data over manually is better.
		return {
			mapFields: original.mapFields,
			leafValue: original.leafValue,
			structFields,
		};
	}
}

/**
 * Record where a schema came from for error reporting purposes.
 * @alpha
 */
export interface Sourced {
	readonly builder: Named<string>;
}
