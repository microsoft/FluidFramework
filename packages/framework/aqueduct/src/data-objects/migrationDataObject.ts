/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";

import { PureDataObject } from "./pureDataObject.js";
import type { DataObjectTypes } from "./types.js";

/**
 * Descriptor for a model shape (arbitrary schema) the migration data object can probe for
 * or create when initializing. The probe function may inspect multiple channels or other
 * runtime state to determine whether the model exists and return a model instance.
 */
export interface ModelDescriptor<T = unknown> {
	// Discriminated union tag
	type?: string;
	// Optional convenience id for simple channel-backed models
	id?: string;
	//* This mechanism feels a bit brittle or overly generic. Maybe each model needs a key channel or something? Or maybe it's ok.
	// Probe runtime for an existing model based on which channels exist. Return the model instance or undefined if not found.
	probe: (runtime: IFluidDataStoreRuntime) => Promise<T | undefined> | T | undefined;
	// Optional factory to create the model when initializing a new store.
	create?: (runtime: IFluidDataStoreRuntime) => Promise<T> | T;
}

/**
 * This base class provides an abstraction between a Data Object's internal data access API
 * and the underlying Fluid data model.  Any number of data models may be supported, for
 * perma-back-compat scenarios where the component needs to be ready to load any version
 * from data at rest.
 * @experimental
 * @legacy
 * @alpha
 */
export abstract class MigrationDataObject<
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObject<I> {
	// The currently active model and its descriptor, if discovered or created.
	#activeModel: { descriptor: ModelDescriptor; model: unknown } | undefined;

	/**
	 * Probeable candidate roots the implementer expects for existing stores.
	 * The order defines probing priority.
	 */
	protected abstract get modelCandidates(): ModelDescriptor[];

	/**
	 * Descriptor used to create the new root when initializing a non-existing store.
	 * If undefined, no root will be created by this base class.
	 */
	protected abstract get modelCreator(): ModelDescriptor | undefined;

	/**
	 * Returns the active model descriptor and channel after initialization.
	 * Throws if initialization did not set a model.
	 */
	public getModel<T = unknown>(): { descriptor: ModelDescriptor<T>; model: T } {
		assert(this.#activeModel !== undefined, "Expected an active model to be defined");
		return {
			descriptor: this.#activeModel.descriptor as ModelDescriptor<T>,
			model: this.#activeModel.model as T,
		};
	}

	/**
	 * Walks the model candidates in order and finds the first one that probes successfully.
	 * Sets the active model if found, otherwise leaves it undefined.
	 */
	private async refreshRoot(): Promise<void> {
		this.#activeModel = undefined;

		for (const descriptor of this.modelCandidates ?? []) {
			try {
				const maybe = await descriptor.probe(this.runtime);
				if (maybe !== undefined) {
					this.#activeModel = { descriptor, model: maybe };
					return;
				}
			} catch {
				// probe error for this candidate; continue to next candidate
			}
		}
	}

	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			await this.refreshRoot();
		} else {
			const creator = this.modelCreator;
			if (creator !== undefined) {
				// Note: implementer is responsible for binding any root channels and populating initial content on the created model
				const created = await creator.create?.(this.runtime);
				if (created !== undefined) {
					this.#activeModel = { descriptor: creator, model: created };
				}
			}
		}

		await super.initializeInternal(existing);
	}

	// Backwards-compatibility helpers (optional for implementers):
	// Implementers may provide RootDescriptor helpers for common types like SharedTree/SharedDirectory
	// rather than implementing create/runtime probing themselves.
}
