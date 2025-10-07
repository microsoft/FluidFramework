/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { DataStoreMessageType } from "@fluidframework/datastore/internal";
import type {
	IFluidDataStoreRuntime,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";

import type { IDelayLoadChannelFactory } from "../channel-factories/index.js";

import { PureDataObject } from "./pureDataObject.js";
import type { DataObjectTypes } from "./types.js";

//* Update comment
/**
 * Information emitted by an old implementation's runtime to request a one-hop migration
 * into a newer implementation.
 *
 * The current expectation (Phase 1) is that this interface is only surfaced during the
 * first realization load path of an existing data store. Newly created data stores should
 * already use the latest implementation and MUST NOT request migration.
 *
 * @legacy @beta
 */
export interface IMigrationInfo extends IProvideMigrationInfo {
	//* TODO: We may want to return additional info (like the target format tag) when we do migrate
	readonly readyToMigrate: () => Promise<boolean>;

	/**
	 * Migrate the data to the new format if allowed and necessary. Otherwise do nothing.
	 * @returns true if migration was performed, false if not (e.g. because the object is already in the target format)
	 */
	readonly tryMigrate: () => Promise<boolean>;
}

/**
 * If migration info is present, indicates the object should be migrated away from.
 *
 * @legacy @beta
 */
export interface IProvideMigrationInfo extends FluidObject {
	/**
	 * For FluidObject discovery
	 */
	IMigrationInfo?: IMigrationInfo | undefined;
}

/**
 * Descriptor for a model shape (arbitrary schema) the migration data object can probe for
 * or create when initializing. The probe function may inspect multiple channels or other
 * runtime state to determine whether the model exists and return a model instance.
 * @legacy
 * @beta
 */
export interface ModelDescriptor<TModel = unknown> {
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
export abstract class MigrationDataObject<
		TUniversalView,
		I extends DataObjectTypes = DataObjectTypes,
		TMigrationData = never, // default case works for a single model descriptor (migration is not needed)
	>
	extends PureDataObject<I>
	implements IProvideMigrationInfo
{
	private readonly readyToMigrate = async (): Promise<boolean> => {
		assert(this.#activeModel !== undefined, "Data model not initialized");

		if (!(await this.canPerformMigration())) {
			return false;
		}

		const [targetDescriptor] = await this.getModelDescriptors();
		//* TODO: Make 'is' required or implement this check some other way
		if (targetDescriptor.is?.(this.#activeModel?.view)) {
			// We're on the latest model, no migration needed
			return false;
		}

		return true;
	};

	public get IMigrationInfo(): IMigrationInfo | undefined {
		return {
			readyToMigrate: async () => {
				return this.readyToMigrate();
			},
			tryMigrate: async () => {
				const ready = await this.readyToMigrate();

				if (!ready) {
					return false;
				}

				await this.migrate();
				return true;
			},
		};
	}

	// The currently active model and its descriptor, if discovered or created.
	#activeModel:
		| { descriptor: ModelDescriptor<TUniversalView>; view: TUniversalView }
		| undefined;

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

		for (const descriptor of await this.getModelDescriptors()) {
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

	/**
	 * Probeable candidate roots the implementer expects for existing stores.
	 * The order defines probing priority.
	 * The first one will also be used for creation.
	 */
	protected abstract getModelDescriptors(): Promise<
		readonly [ModelDescriptor<TUniversalView>, ...ModelDescriptor<TUniversalView>[]]
	>;

	/**
	 * Whether migration is supported by this data object at this time.
	 * May depend on flighting or other dynamic configuration.
	 */
	protected abstract canPerformMigration(): Promise<boolean>;

	/**
	 * Data required for running migration. This is necessary because the migration must happen synchronously.
	 *
	 * An example of what to asynchronously retrieve could be getting the "old" DDS that you want to migrate the data of:
	 * ```
	 * async (root) => {
	 *     root.get<IFluidHandle<SharedMap>>("mapKey").get();
	 * }
	 * ```
	 */
	protected abstract asyncGetDataForMigration(
		existingModel: TUniversalView,
	): Promise<TMigrationData>;

	/**
	 * Migrate the DataObject upon resolve (i.e. on retrieval of the DataStore).
	 *
	 * An example implementation could be changing which underlying DDS is used to represent the DataObject's data:
	 * ```
	 * (runtime, treeRoot, data) => {
	 *     // ! These are not all real APIs and are simply used to convey the purpose of this method
	 *     const mapContent = data.getContent();
	 *     const view = treeRoot.viewWith(treeConfiguration);
	 *     view.initialize(
	 *         new MyTreeSchema({
	 *             arbitraryMap: mapContent,
	 *         }),
	 *     );
	 *     view.dispose();
	 * }
	 * ```
	 * @param newModel - New model which is ready to be populated with the data
	 * @param data - Provided by the "asyncGetDataForMigration" function
	 */
	protected abstract migrateDataObject(newModel: TUniversalView, data: TMigrationData): void;

	public async shouldMigrateBeforeInitialized(): Promise<boolean> {
		return this.readyToMigrate();
	}

	//* TODO: add new DataStoreMessageType.Conversion
	private static readonly conversionContent = "conversion";

	private submitConversionOp(): void {
		this.context.submitMessage(
			DataStoreMessageType.ChannelOp,
			MigrationDataObject.conversionContent,
			undefined,
		);
	}

	#migrateLock = false;

	public async migrate(): Promise<void> {
		if (!(await this.canPerformMigration()) || this.#migrateLock) {
			return;
		}

		//* Should this move down a bit lower, to have less code in the lock zone?
		this.#migrateLock = true;

		try {
			// Read the model descriptors from the DataObject ctor (single source of truth).
			const modelDescriptors = await this.getModelDescriptors();

			//* NEXT: Get target based on SettingsProvider
			// Destructure the target/first descriptor and probe it first. If it's present,
			// the object already uses the target model and we're done.
			const [targetDescriptor, ...otherDescriptors] = modelDescriptors;
			const maybeTarget = await targetDescriptor.probe(this.runtime);
			if (maybeTarget !== undefined) {
				// Already on target model; nothing to do.
				return;
			}
			// Download the code in parallel with async operations happening on the existing model
			const targetFactoriesP = targetDescriptor.ensureFactoriesLoaded();

			// Find the first model that probes successfully.
			let existingModel: TUniversalView | undefined;
			for (const desc of otherDescriptors) {
				//* Should probe errors be fatal?
				existingModel = await desc.probe(this.runtime).catch(() => undefined);
				if (existingModel !== undefined) {
					break;
				}
			}
			assert(
				existingModel !== undefined,
				"Unable to match runtime structure to any known data model",
			);

			// Retrieve any async data required for migration using the discovered existing model (may be undefined)
			// In parallel, we are waiting for the target factories to load
			const data = await this.asyncGetDataForMigration(existingModel);
			await targetFactoriesP;

			// ! TODO: ensure these ops aren't sent immediately AB#41625
			this.submitConversionOp();

			// Create the target model and run migration.
			const newModel = targetDescriptor.create(this.runtime);

			// Call consumer-provided migration implementation
			this.migrateDataObject(newModel, data);

			// We deferred full initialization while migration was pending.
			// This will complete initialization now that migration has finished.
			assert(!(await this.readyToMigrate()), "Migration did not complete successfully");
			await this.finishInitialization(true /* existing */);

			//* TODO: evacuate old model
			//* i.e. delete unused root contexts, and ensure Summarizer does full-tree summary here next time.
			//* Can be a follow-up.
		} finally {
			this.#migrateLock = false;
		}
	}

	//* FUTURE: Can we prevent subclasses from overriding this?
	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			await this.inferModelFromRuntime();
		} else {
			//* NEXT: Pick the right model based on SettingsProvider
			const modelDescriptors = await this.getModelDescriptors();
			const creator = modelDescriptors[0];
			await creator.ensureFactoriesLoaded();

			// Note: implementer is responsible for binding any root channels and populating initial content on the created model
			const created = creator.create(this.runtime);
			this.#activeModel = { descriptor: creator, view: created };
		}

		if (await this.shouldMigrateBeforeInitialized()) {
			// initializeInternal will be called after migration is complete instead of now
			return;
		}

		await super.initializeInternal(existing);
	}

	/**
	 * Generates an error string indicating an item is uninitialized.
	 * @param item - The name of the item that was uninitialized.
	 */
	protected getUninitializedErrorString(item: string): string {
		return `${item} must be initialized before being accessed.`;
	}
}
