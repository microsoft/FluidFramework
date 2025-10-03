/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IProvideMigrationInfo,
	IMigrationInfo,
} from "@fluidframework/container-runtime/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	IFluidDataStoreRuntime,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";

import type { IDelayLoadChannelFactory } from "../channel-factories/index.js";

import { PureDataObject } from "./pureDataObject.js";
import type { DataObjectTypes, IDataObjectProps } from "./types.js";

/**
 * Descriptor for a model shape (arbitrary schema) the migration data object can probe for
 * or create when initializing. The probe function may inspect multiple channels or other
 * runtime state to determine whether the model exists and return a model instance.
 * @legacy
 * @beta
 */
export interface ModelDescriptor<TModel = unknown> {
	//* TODO: Added this for format tag, it's subject to change
	name?: string;
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
 * @beta
 */
export abstract class MultiFormatDataObject<
		TUniversalView,
		I extends DataObjectTypes = DataObjectTypes,
	>
	extends PureDataObject<I>
	implements IProvideMigrationInfo
{
	private readonly _modelDescriptors?: readonly [
		ModelDescriptor<TUniversalView>,
		...ModelDescriptor<TUniversalView>[],
	];

	public constructor(
		props: IDataObjectProps<I>,
		modelDescriptors?: readonly [
			ModelDescriptor<TUniversalView>,
			...ModelDescriptor<TUniversalView>[],
		],
	) {
		super(props);
		this._modelDescriptors = modelDescriptors;
	}

	public get IMigrationInfo(): IMigrationInfo | undefined {
		assert(this.#activeModel !== undefined, "Data model not initialized");
		if (!this.canPerformMigration()) {
			return undefined;
		}

		const targetDescriptor = this.modelCandidates[0];
		//* TODO: Make 'is' required or implement this check some other way
		if (targetDescriptor.is?.(this.#activeModel?.view)) {
			// We're on the latest model, no migration needed
			return undefined;
		}

		return {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- //* TODO: make 'name' required
			targetFormatTag: targetDescriptor.name!,
			getPortableData: async () => {
				return this.portableMigrationData;
			},
		};
	}

	/**
	 * Inject logic to indicate whether it's time to migrate
	 * e.g. using this.providers to get app-level config
	 * @remarks
	 * This is called after initialization when loading an existing object.
	 * If it returns true, the container will call IMigrationInfo.getPortableData()
	 * and then create a new instance of this data object with the target model
	 * and call migrateDataObject() to allow the implementer to move data from
	 * the old model to the new one.
	 */
	protected abstract canPerformMigration(): boolean;

	//* TODO: Can we get the types plumbed around here?
	protected abstract get portableMigrationData(): unknown;

	// The currently active model and its descriptor, if discovered or created.
	#activeModel:
		| { descriptor: ModelDescriptor<TUniversalView>; view: TUniversalView }
		| undefined;

	/**
	 * Probeable candidate roots the implementer expects for existing stores.
	 * The order defines probing priority.
	 * The first one will also be used for creation.
	 *
	 * @privateremarks
	 * IMPORTANT: This accesses a static member on the subclass, so beware of class initialization order issues
	 */
	private get modelCandidates(): readonly [
		ModelDescriptor<TUniversalView>,
		...ModelDescriptor<TUniversalView>[],
	] {
		assert(this._modelDescriptors !== undefined, "No model descriptors provided");
		return this._modelDescriptors;
	}

	/**
	 * Returns the active model descriptor and channel after initialization.
	 * Throws if initialization did not set a model.
	 */
	public get dataModel():
		| { descriptor: ModelDescriptor<TUniversalView>; view: TUniversalView }
		| undefined {
		return this.#activeModel;
	}

	/**
	 * Walks the model candidates in order and finds the first one that probes successfully.
	 * Sets the active model if found, otherwise leaves it undefined.
	 */
	private async inferModelFromRuntime(): Promise<void> {
		this.#activeModel = undefined;

		for (const descriptor of this.modelCandidates) {
			try {
				const maybe = await descriptor.probe(this.runtime);
				if (maybe !== undefined) {
					this.#activeModel = { descriptor, view: maybe };
					return;
				}
			} catch {
				// probe error for this candidate; continue to next candidate
			}
		}

		//* TODO: Throw if we reach here?  It means no expected models were found
	}

	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			await this.inferModelFromRuntime();
		} else {
			const creator = this.modelCandidates[0];
			await creator.ensureFactoriesLoaded();

			// Note: implementer is responsible for binding any root channels and populating initial content on the created model
			const created = creator.create(this.runtime);
			this.#activeModel = { descriptor: creator, view: created };
		}

		if (this.IMigrationInfo === undefined) {
			await super.initializeInternal(existing);
		}
	}

	/**
	 * Generates an error string indicating an item is uninitialized.
	 * @param item - The name of the item that was uninitialized.
	 */
	protected getUninitializedErrorString(item: string): string {
		return `${item} must be initialized before being accessed.`;
	}
}
