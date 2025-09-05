/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IFluidDataStoreRuntime,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import {
	SharedDirectory,
	SharedMap,
	type ISharedDirectory,
} from "@fluidframework/map/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { SharedTree, type ITree } from "@fluidframework/tree/internal";

import type { IDelayLoadChannelFactory } from "../channel-factories/index.js";

import { dataObjectRootDirectoryId } from "./dataObject.js";
import { PureDataObject } from "./pureDataObject.js";
import { treeChannelId } from "./treeDataObject.js";
import type { DataObjectTypes } from "./types.js";

/**
 * Descriptor for a model shape (arbitrary schema) the migration data object can probe for
 * or create when initializing. The probe function may inspect multiple channels or other
 * runtime state to determine whether the model exists and return a model instance.
 * @legacy
 * @alpha
 */
export interface ModelDescriptor<TModel = unknown> {
	// Discriminated union tag
	type?: string;
	// Optional convenience id for simple channel-backed models
	id?: string;
	//* Consider if we want something more formal here or if "duck typing" the runtime channel structure is sufficient.
	//* See Craig's DDS shim branch for an example of tagging migrations
	// Probe runtime for an existing model based on which channels exist. Return the model instance or undefined if not found.
	probe: (runtime: IFluidDataStoreRuntime) => Promise<TModel | undefined>;
	/**
	 * Load any delay-loaded factories needed for this model.
	 *
	 * @remarks
	 * This must be called before create can be called - otherwise the factory may be missing!
	 */
	ensureFactoriesLoaded: () => Promise<void>;
	/**
	 * Synchronously create the model.
	 * @remarks
	 * Any delay-loaded factories must already have been loaded via ModelDescriptor.loadFactories.
	 */
	create: (runtime: IFluidDataStoreRuntime) => TModel;
	/**
	 * The factories needed for this Data Model, divided by whether they are always loaded or delay-loaded
	 */
	sharedObjects: {
		//* Do we need to split these apart or just have IChannelFactory[]?
		alwaysLoaded?: IChannelFactory[];
		delayLoaded?: IDelayLoadChannelFactory[];
	};
	// Optional runtime type guard to help callers narrow model types.
	//* Probably remove?  Copilot added it
	is?: (m: unknown) => m is TModel;
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
	TUniversalView,
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObject<I> {
	// The currently active model and its descriptor, if discovered or created.
	#activeModel:
		| { descriptor: ModelDescriptor<TUniversalView>; model: TUniversalView }
		| undefined;

	/**
	 * Probeable candidate roots the implementer expects for existing stores.
	 * The order defines probing priority.
	 * The first one will also be used for creation.
	 */
	protected abstract get modelCandidates(): [
		ModelDescriptor<TUniversalView>,
		...ModelDescriptor<TUniversalView>[],
	];

	/**
	 * Returns the active model descriptor and channel after initialization.
	 * Throws if initialization did not set a model.
	 */
	public getModel():
		| { descriptor: ModelDescriptor<TUniversalView>; model: TUniversalView }
		| undefined {
		return this.#activeModel;
	}

	/**
	 * Walks the model candidates in order and finds the first one that probes successfully.
	 * Sets the active model if found, otherwise leaves it undefined.
	 */
	private async inferModelFromRuntime(): Promise<void> {
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
			await this.inferModelFromRuntime();
		} else {
			const creator = this.modelCandidates[0];
			await creator.ensureFactoriesLoaded();

			// Note: implementer is responsible for binding any root channels and populating initial content on the created model
			const created = creator.create(this.runtime);
			if (created !== undefined) {
				this.#activeModel = { descriptor: creator, model: created };
			}
		}

		await super.initializeInternal(existing);
	}
}

/**
 * Convenience descriptor for SharedDirectory-backed models using the standard root id.
 */
export function sharedDirectoryDescriptor(): ModelDescriptor<{ directory: ISharedDirectory }> {
	return {
		type: "sharedDirectory",
		id: dataObjectRootDirectoryId,
		sharedObjects: {
			// SharedDirectory is always loaded on the root id
			alwaysLoaded: [
				SharedDirectory.getFactory(),
				// TODO: Remove SharedMap factory when compatibility with SharedMap DataObject is no longer needed in 0.10
				SharedMap.getFactory(),
			],
		},
		probe: async (runtime) => {
			try {
				const directory = await runtime.getChannel(dataObjectRootDirectoryId);
				if (SharedDirectory.is(directory)) {
					return { directory };
				}
			} catch {
				return undefined;
			}
		},
		ensureFactoriesLoaded: async () => {},
		create: (runtime) => {
			const directory = SharedDirectory.create(runtime, dataObjectRootDirectoryId);
			directory.bindToContext();
			return { directory };
		},
		is: (m): m is { directory: ISharedDirectory } =>
			!!(m && (m as unknown as Record<string, unknown>).directory),
	};
}

/**
 * Convenience descriptor for SharedTree-backed models using the standard tree channel id
 * and a delay-load factory.
 */
export function sharedTreeDescriptor(
	factory: IDelayLoadChannelFactory<ITree & ISharedObject>, //* ISharedObject needed for bindToContext call
): ModelDescriptor<{ tree: ITree }> {
	return {
		type: "sharedTree",
		id: treeChannelId,
		sharedObjects: {
			// Tree is provided via a delay-load factory
			delayLoaded: [factory],
		},
		probe: async (runtime) => {
			try {
				const tree = await runtime.getChannel(treeChannelId);
				if (SharedTree.is(tree)) {
					return { tree };
				}
			} catch {
				return undefined;
			}
		},
		ensureFactoriesLoaded: async () => {
			await factory.loadObjectKindAsync();
		},
		create: (runtime) => {
			const tree = factory.create(runtime, treeChannelId);
			tree.bindToContext();
			return { tree };
		},
		is: (m): m is { tree: ITree } => !!(m && (m as unknown as Record<string, unknown>).tree),
	};
}
