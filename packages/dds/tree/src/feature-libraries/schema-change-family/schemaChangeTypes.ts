/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeStoredSchema } from "../../core/index.js";
import { defaultSchemaPolicy } from "../default-schema/index.js";
import { allowsRepoSuperset } from "../modular-schema/index.js";

/** A change to the document's stored schema */
export abstract class SchemaChangeset {
	#conflicted?: boolean;

	public constructor(
		/** The schema of the context in which this change was created (i.e. the schema that would result if all changes prior to this one, including those it has rebased over, were applied) */
		public readonly input: TreeStoredSchema,
		/** The new schema requested by the original version of this change in its initial authoring context (i.e. before any rebasing over other changes) */
		public readonly proposed: TreeStoredSchema,
		/**
		 * Whether this changeset was produced by a {@link SchemaChangeset.rollback | rollback}.
		 * @remarks Also true for rollbacks of rollbacks and {@link SchemaChangeset.rebase | rebases} of rollbacks.
		 */
		public readonly isRollback = false,
	) {}

	/**
	 * True if this changeset cannot be applied cleanly due to the original {@link SchemaChangeset.proposed | intent} and/or context being incompatible with the {@link SchemaChangeset.input | current context}
	 * @remarks Computed on first access and cached for this changeset
	 */
	public get isConflicted(): boolean {
		if (this.#conflicted === undefined) {
			this.#conflicted = this.hasConflicts();
		}
		return this.#conflicted;
	}

	/**
	 * The resulting schema after applying this changeset
	 * @throws if this changeset is {@link SchemaChangeset.isConflicted | conflicted}.
	 */
	public get output(): TreeStoredSchema {
		if (this.isConflicted) {
			throw new Error("Cannot get output of a conflicted changeset");
		}
		return this.getOutput();
	}

	/**
	 * Produce a changeset that "rolls back" this change's effects, such that the schema prior to this change applying is restored
	 * @remarks Produces a no-op if this change is conflicted
	 */
	public rollback(): SchemaChangeset {
		return this.isConflicted ? new NoopSchemaChangeset(this.input, true) : this.getRollback();
	}

	/**
	 * Produce a version of this changeset rebased over another changeset
	 * @remarks Conflicted base changesets have no effect
	 */
	public rebase(over: SchemaChangeset): SchemaChangeset {
		return over.isConflicted ? this : this.withInput(over.output);
	}

	/**
	 * The resulting schema after applying this changeset
	 * @remarks Only called when the changeset is not conflicted
	 */
	protected abstract getOutput(): TreeStoredSchema;
	/** Compute whether this changeset conflicts with its input context */
	protected abstract hasConflicts(): boolean;
	/** Create a version of this changeset with the same {@link SchemaChangeset.proposed | intentions} but a different {@link SchemaChangeset.input | input schema} */
	protected abstract withInput(input: TreeStoredSchema): SchemaChangeset;
	/**
	 * Create a version of this changeset that restores the schema to its state prior to this change
	 * @remarks Only called when the changeset is not conflicted
	 */
	protected abstract getRollback(): SchemaChangeset;
}

/**
 * A {@link SchemaChangeset} that possibly widens (but never narrows) the schema
 * @remarks A schema `A` is wider than a schema `B` if the set of documents permitted by `A` is a superset of those permitted by `B`.
 * A widening change may widen the schema, or it may keep it the same if it's already as wide as (or wider than) necessary.
 */
export class WideningSchemaChangeset extends SchemaChangeset {
	protected override getOutput(): TreeStoredSchema {
		// If `input` == `proposed`, we return `proposed` rather than `input`.
		// This preserves changes to `proposed` vs. `input` that are not considered by schema compatibility (e.g. changes to schema metadata).
		return allowsRepoSuperset(defaultSchemaPolicy, this.input, this.proposed)
			? this.proposed
			: this.input;
	}

	protected override hasConflicts(): boolean {
		return areSchemasDivergent(this.proposed, this.input);
	}

	protected override withInput(input: TreeStoredSchema): WideningSchemaChangeset {
		return new WideningSchemaChangeset(input, this.proposed, this.isRollback);
	}

	protected override getRollback(): NarrowingSchemaChangeset {
		return new NarrowingSchemaChangeset(this.getOutput(), this.input, true);
	}
}

/**
 * A {@link SchemaChangeset} that possibly narrows (but never widens) the schema
 * @remarks A schema `A` is narrower than a schema `B` if the set of documents permitted by `B` is a superset of those permitted by `A`.
 * A narrowing change may narrow the schema, or it may keep it the same if it's already as narrow as (or narrower than) necessary.
 */
export class NarrowingSchemaChangeset extends SchemaChangeset {
	protected override getOutput(): TreeStoredSchema {
		// If `input` == `proposed`, we return `proposed` rather than `input`.
		// This preserves changes to `proposed` vs. `input` that are not considered by schema compatibility (e.g. changes to schema metadata).
		return allowsRepoSuperset(defaultSchemaPolicy, this.proposed, this.input)
			? this.proposed
			: this.input;
	}

	protected override hasConflicts(): boolean {
		return areSchemasDivergent(this.proposed, this.input);
	}

	protected override withInput(input: TreeStoredSchema): NarrowingSchemaChangeset {
		return new NarrowingSchemaChangeset(input, this.proposed, this.isRollback);
	}

	protected override getRollback(): WideningSchemaChangeset {
		return new WideningSchemaChangeset(this.getOutput(), this.input, true);
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
		isRollback: boolean = false,
	) {
		super(input, proposed, isRollback);
	}

	protected override getOutput(): TreeStoredSchema {
		return this.proposed;
	}

	protected override hasConflicts(): boolean {
		return !areSchemasEquivalent(this.original, this.input);
	}

	protected override withInput(input: TreeStoredSchema): CompareAndSwapSchemaChangeset {
		return new CompareAndSwapSchemaChangeset(
			input,
			this.proposed,
			this.original,
			this.isRollback,
		);
	}

	protected override getRollback(): CompareAndSwapSchemaChangeset {
		const output = this.getOutput();
		return new CompareAndSwapSchemaChangeset(output, this.input, output, true);
	}
}

/**
 * A {@link SchemaChangeset} that represents a no-op change, which does not modify the schema and never has conflicts
 */
export class NoopSchemaChangeset extends SchemaChangeset {
	public constructor(input: TreeStoredSchema, isRollback: boolean) {
		super(input, input, isRollback);
	}

	protected override getOutput(): TreeStoredSchema {
		return this.input;
	}

	protected override hasConflicts(): boolean {
		return false;
	}

	protected override withInput(input: TreeStoredSchema): NoopSchemaChangeset {
		return new NoopSchemaChangeset(input, this.isRollback);
	}

	protected override getRollback(): NoopSchemaChangeset {
		return new NoopSchemaChangeset(this.getOutput(), true);
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
