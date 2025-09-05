/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";
import type {
	AsyncFluidObjectProvider,
	FluidObjectSymbolProvider,
	IFluidDependencySynthesizer,
} from "@fluidframework/synthesize/internal";

import type {
	DataObjectTypes,
	MigrationDataObject,
	ModelDescriptor,
} from "../data-objects/index.js";

import {
	PureDataObjectFactory,
	type DataObjectFactoryProps,
} from "./pureDataObjectFactory.js";

/**
 * Represents the properties required to create a MigrationDataObjectFactory.
 * @experimental
 * @legacy
 * @alpha
 */
export interface MigrationDataObjectFactoryProps<
	M,
	TObj extends MigrationDataObject<M, I>,
	TMigrationData,
	I extends DataObjectTypes = DataObjectTypes,
> extends DataObjectFactoryProps<TObj, I> {
	/**
	 * Used for determining whether or not a migration can be performed based on providers and/or feature gates.
	 *
	 * An example might look like:
	 * ```
	 * async (providers) => {
	 *     const settingsProvider = await providers["SettingsProviders"];
	 *     return settingsProvider.getFeatureGate("myComponent.canMigrate");
	 * }
	 * ```
	 */
	canPerformMigration: (
		providers: AsyncFluidObjectProvider<I["OptionalProviders"]>,
	) => Promise<boolean>;

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
	asyncGetDataForMigration: (existingModel: M) => Promise<TMigrationData>;

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
	 * @param data - Provided by the "asyncGetDataForMigration" function
	 */
	migrateDataObject: (
		runtime: FluidDataStoreRuntime,
		newModel: M,
		data: TMigrationData,
	) => void;

	/**
	 * If not provided, the Container will be closed after migration due to underlying changes affecting the data model.
	 */
	refreshDataObject?: () => Promise<void>;

	// Descriptors ordered by desired priority. The first descriptor is the target (new) model.
	modelDescriptors: [ModelDescriptor<M>, ...ModelDescriptor<M>[]];
}

/**
 * MigrationDataObjectFactory is the IFluidDataStoreFactory for migrating DataObjects.
 * See MigrationDataObjectFactoryProps for more information on how to utilize this factory.
 *
 * @experimental
 * @legacy
 * @alpha
 */
export class MigrationDataObjectFactory<
	M,
	TObj extends MigrationDataObject<M, I>,
	TMigrationData,
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObjectFactory<TObj, I> {
	private migrateLock = false;

	// ! TODO: add new DataStoreMessageType.Conversion
	private static readonly conversionContent = "conversion";

	public constructor(
		private readonly props: MigrationDataObjectFactoryProps<M, TObj, TMigrationData, I>,
	) {
		const submitConversionOp = (runtime: FluidDataStoreRuntime): void => {
			runtime.submitMessage(
				DataStoreMessageType.ChannelOp,
				MigrationDataObjectFactory.conversionContent,
				undefined,
			);
		};

		const fullMigrateDataObject = async (runtime: IFluidDataStoreChannel): Promise<void> => {
			const realRuntime = runtime as FluidDataStoreRuntime;
			// Descriptor-driven migration flow (no backwards compatibility path)
			if (!this.canPerformMigration || this.migrateLock) {
				return;
			}

			this.migrateLock = true;

			try {
				// Destructure the target/first descriptor and probe it first. If it's present,
				// the object already uses the target model and we're done.
				const [targetDescriptor, ...otherDescriptors] = this.props.modelDescriptors;
				//* TODO: Wrap error here with a proper error type?
				const maybeTarget = await targetDescriptor.probe(realRuntime);
				if (maybeTarget !== undefined) {
					// Already on target model; nothing to do.
					return;
				}

				// Find the first model that probes successfully.
				let existingModel: M | undefined;
				for (const desc of otherDescriptors) {
					//* Should probe errors be fatal?
					existingModel = await desc.probe(realRuntime).catch(() => undefined);
					if (existingModel !== undefined) {
						break;
					}
				}
				assert(
					existingModel !== undefined,
					"Unable to match runtime structure to any known data model",
				);

				// Retrieve any async data required for migration using the discovered existing model (may be undefined)
				const data = await this.props.asyncGetDataForMigration(existingModel);

				// Create the target model and run migration.
				const newModel = await targetDescriptor.create(realRuntime);

				// Call consumer-provided migration implementation
				this.props.migrateDataObject(realRuntime, newModel, data);

				//* TODO: evacuate old model
				//* i.e. delete unused root contexts, but not only that.  GC doesn't run sub-DataStore.
				//* So we will need to plumb through now-unused channels to here.  Can be a follow-up.
			} finally {
				this.migrateLock = false;
			}
		};

		const runtimeClass = props.runtimeClass ?? FluidDataStoreRuntime;

		super({
			...props,
			afterBindRuntime: fullMigrateDataObject,
			runtimeClass: class MigratorDataStoreRuntime extends runtimeClass {
				private migrationOpSeqNum = -1;
				private readonly seqNumsToSkip = new Set<number>();

				public processMessages(messageCollection: IRuntimeMessageCollection): void {
					let contents: IRuntimeMessagesContent[] = [];
					const sequenceNumber = messageCollection.envelope.sequenceNumber;

					// ! TODO: add loser validation AB#41626
					if (
						// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
						messageCollection.envelope.type === DataStoreMessageType.ChannelOp &&
						messageCollection.messagesContent.some(
							(val) => val.contents === MigrationDataObjectFactory.conversionContent,
						)
					) {
						if (this.migrationOpSeqNum === -1) {
							// This is the first migration op we've seen
							this.migrationOpSeqNum = sequenceNumber;
						} else {
							// Skip seqNums that lost the race
							this.seqNumsToSkip.add(sequenceNumber);
						}
					}

					contents = messageCollection.messagesContent.filter(
						(val) => val.contents !== MigrationDataObjectFactory.conversionContent,
					);

					if (this.seqNumsToSkip.has(sequenceNumber) || contents.length === 0) {
						return;
					}

					super.processMessages({
						...messageCollection,
						messagesContent: contents,
					});
				}

				public reSubmit(
					type: DataStoreMessageType,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					content: any,
					localOpMetadata: unknown,
				): void {
					if (
						type === DataStoreMessageType.ChannelOp &&
						content === MigrationDataObjectFactory.conversionContent
					) {
						submitConversionOp(this);
						return;
					}
					super.reSubmit(type, content, localOpMetadata);
				}

				//* TODO: Replace with generic "evacuate" function on ModelDescriptor
				public removeRoot(): void {
					//* this.contexts.delete(dataObjectRootDirectoryId);
				}
			},
		});
	}

	private canPerformMigration: boolean | undefined;

	/**
	 * ! TODO
	 * @remarks Assumption is that the IFluidDataStoreContext will remain constant for the lifetime of a given MigrationDataObjectFactory instance
	 */
	protected override async observeCreateDataObject(createProps: {
		context: IFluidDataStoreContext;
		optionalProviders: FluidObjectSymbolProvider<I["OptionalProviders"]>;
	}): Promise<void> {
		if (this.canPerformMigration === undefined) {
			const scope: FluidObject<IFluidDependencySynthesizer> = createProps.context.scope;
			const providers =
				scope.IFluidDependencySynthesizer?.synthesize<I["OptionalProviders"]>(
					createProps.optionalProviders,
					{},
				) ??
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				({} as AsyncFluidObjectProvider<never>);

			this.canPerformMigration = await this.props.canPerformMigration(providers);
		}
	}
}
