/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeStoredSchema } from "../../core/index.js";
import { defaultSchemaPolicy } from "../default-schema/index.js";
import { allowsRepoSuperset } from "../modular-schema/index.js";

/** A change to the document's stored schema */
export abstract class SchemaChangeset {
	public constructor(
		/** The schema of the context in which this change was created (i.e. the schema that would result if all changes prior to this one, including those it has rebased over, were applied) */
		public readonly input: TreeStoredSchema,
		/** The new schema requested by the original version of this change in its initial authoring context (i.e. before any rebasing over other changes) */
		public readonly proposed: TreeStoredSchema,
	) {}

	/**
	 * The resulting schema after applying this changeset
	 * @remarks Check that the changeset is not {@link SchemaChangeset.hasConflicts | conflicted} before using the output, otherwise it may be invalid or nonsensical
	 */
	public abstract get output(): TreeStoredSchema;
	/** True if this changeset cannot be applied cleanly due to the original {@link SchemaChangeset.proposed | intent} and/or context being incompatible with the {@link SchemaChangeset.input | current context} */
	public abstract hasConflicts(): boolean;
	/** Create a version of this changeset with the same {@link SchemaChangeset.proposed | intentions} but a different {@link SchemaChangeset.input | input schema} */
	public abstract withInput(input: TreeStoredSchema): SchemaChangeset;
}

/**
 * A {@link SchemaChangeset} that possibly widens (but never narrows) the schema
 * @remarks A schema `A` is wider than a schema `B` if the set of documents permitted by `A` is a superset of those permitted by `B`.
 * A widening change may widen the schema, or it may keep it the same if it's already as wide as (or wider than) necessary.
 */
export class WideningSchemaChangeset extends SchemaChangeset {
	public override get output(): TreeStoredSchema {
		// If `input` == `proposed`, we return `proposed` rather than `input`.
		// This preserves changes to `proposed` vs. `input` that are not considered by schema compatibility (e.g. changes to schema metadata).
		return allowsRepoSuperset(defaultSchemaPolicy, this.input, this.proposed)
			? this.proposed
			: this.input;
	}

	public override hasConflicts(): boolean {
		return areSchemasDivergent(this.proposed, this.input);
	}

	public override withInput(input: TreeStoredSchema): WideningSchemaChangeset {
		return new WideningSchemaChangeset(input, this.proposed);
	}
}

/**
 * A {@link SchemaChangeset} that possibly narrows (but never widens) the schema
 * @remarks A schema `A` is narrower than a schema `B` if the set of documents permitted by `B` is a superset of those permitted by `A`.
 * A narrowing change may narrow the schema, or it may keep it the same if it's already as narrow as (or narrower than) necessary.
 */
export class NarrowingSchemaChangeset extends SchemaChangeset {
	public override get output(): TreeStoredSchema {
		// If `input` == `proposed`, we return `proposed` rather than `input`.
		// This preserves changes to `proposed` vs. `input` that are not considered by schema compatibility (e.g. changes to schema metadata).
		return allowsRepoSuperset(defaultSchemaPolicy, this.proposed, this.input)
			? this.proposed
			: this.input;
	}

	public override hasConflicts(): boolean {
		return areSchemasDivergent(this.proposed, this.input);
	}

	public override withInput(input: TreeStoredSchema): NarrowingSchemaChangeset {
		return new NarrowingSchemaChangeset(input, this.proposed);
	}
}

/**
 * A {@link SchemaChangeset} that changes the schema if and only if the current schema is equivalent to the original schema in which this change was first authored
 * @remarks The original schema defaults to the input schema unless explicitly provided
 */
export class CompareAndSwapSchemaChangeset extends SchemaChangeset {
	public constructor(
		input: TreeStoredSchema,
		proposed: TreeStoredSchema,
		/** The schema in the original authoring context, unchanged by rebasing */
		public readonly original: TreeStoredSchema = input,
	) {
		super(input, proposed);
	}

	public override get output(): TreeStoredSchema {
		return this.proposed;
	}

	public override hasConflicts(): boolean {
		return !areSchemasEquivalent(this.original, this.input);
	}

	public override withInput(input: TreeStoredSchema): CompareAndSwapSchemaChangeset {
		return new CompareAndSwapSchemaChangeset(input, this.proposed, this.original);
	}
}

function areSchemasDivergent(a: TreeStoredSchema, b: TreeStoredSchema): boolean {
	return (
		!allowsRepoSuperset(defaultSchemaPolicy, a, b) &&
		!allowsRepoSuperset(defaultSchemaPolicy, b, a)
	);
}

function areSchemasEquivalent(a: TreeStoredSchema, b: TreeStoredSchema): boolean {
	return (
		allowsRepoSuperset(defaultSchemaPolicy, a, b) &&
		allowsRepoSuperset(defaultSchemaPolicy, b, a)
	);
}
