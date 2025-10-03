/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrationTargetFluidDataStoreFactory } from "@fluidframework/container-runtime/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";
import type {
	AsyncFluidObjectProvider,
	IFluidDependencySynthesizer,
} from "@fluidframework/synthesize/internal";

import type { IDelayLoadChannelFactory } from "../channel-factories/index.js";
import type {
	DataObjectTypes,
	IDataObjectProps,
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
 * @beta
 */
export interface MigrationDataObjectFactoryProps<
	TObj extends MigrationDataObject<TUniversalView, I>,
	TUniversalView,
	I extends DataObjectTypes = DataObjectTypes,
	TMigrationData = never, // default case works for a single model descriptor (migration is not needed)
> extends DataObjectFactoryProps<TObj, I> {
	/**
	 * The constructor for the data object.
	 */
	ctor: new (
		props: IDataObjectProps<I>,
		//* TODO: Add type alias for this tuple type
		modelDescriptors?: readonly [
			ModelDescriptor<TUniversalView>,
			...ModelDescriptor<TUniversalView>[],
		],
	) => TObj;

	/**
	 * Ordered list of model descriptors participating in migration. The first entry is treated as the migration
	 * target ("latest") that will be instantiated and populated during `migrate`.
	 */
	modelDescriptors: readonly [
		ModelDescriptor<TUniversalView>,
		...ModelDescriptor<TUniversalView>[],
	];

	//* TODO: How can we support the app's ability to specify which is "Latest" model via config?

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
	// canPerformMigration: (
	// 	providers: AsyncFluidObjectProvider<I["OptionalProviders"]>,
	// ) => Promise<boolean>;
	//* MOVED TO MIGRATION DATA OBJECT - stubbed out for the moment (TODO: clean up)
	canPerformMigration?: unknown;

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
	// asyncGetDataForMigration: (existingModel: TUniversalView) => Promise<TMigrationData>;
	//* MOVED TO MIGRATION DATA OBJECT - stubbed out for the moment (TODO: clean up)
	asyncGetDataForMigration?: unknown;

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
	migrateDataObject: (
		runtime: FluidDataStoreRuntime,
		newModel: TUniversalView,
		data: TMigrationData,
	) => void;

	/**
	 * If not provided, the Container will be closed after migration due to underlying changes affecting the data model.
	 */
	refreshDataObject?: () => Promise<void>;
}

/**
 * MigrationDataObjectFactory is the IFluidDataStoreFactory for migrating DataObjects.
 * See MigrationDataObjectFactoryProps for more information on how to utilize this factory.
 *
 * @experimental
 * @legacy
 * @beta
 */
export class MigrationDataObjectFactory<
		TObj extends MigrationDataObject<TUniversalView, I>,
		TUniversalView,
		I extends DataObjectTypes = DataObjectTypes,
		TMigrationData = never, // default case works for a single model descriptor (migration is not needed)
	>
	extends PureDataObjectFactory<TObj, I>
	implements IMigrationTargetFluidDataStoreFactory
{
	// ! TODO: add new DataStoreMessageType.Conversion
	private static readonly conversionContent = "conversion";

	//* TODO: add default values for migration-related props
	public constructor(
		private readonly props: MigrationDataObjectFactoryProps<
			TObj,
			TUniversalView,
			I,
			TMigrationData
		>,
	) {
		const submitConversionOp = (runtime: FluidDataStoreRuntime): void => {
			runtime.submitMessage(
				DataStoreMessageType.ChannelOp,
				MigrationDataObjectFactory.conversionContent,
				undefined,
			);
		};

		const runtimeClass = props.runtimeClass ?? FluidDataStoreRuntime;

		// Shallow copy since the input array is typed as a readonly array
		const sharedObjects = [...(props.sharedObjects ?? [])];

		//* TODO: Maybe we don't need to split by delay-loaded here (and in ModelDescriptor type)
		const allFactories: {
			alwaysLoaded: Map<string, IChannelFactory>;
			delayLoaded: Map<string, IDelayLoadChannelFactory>;
			// eslint-disable-next-line unicorn/no-array-reduce
		} = props.modelDescriptors.reduce(
			(acc, curr) => {
				for (const factory of curr.sharedObjects.alwaysLoaded ?? []) {
					acc.alwaysLoaded.set(factory.type, factory);
				}
				for (const factory of curr.sharedObjects.delayLoaded ?? []) {
					acc.delayLoaded.set(factory.type, factory);
				}
				return acc;
			},
			{
				alwaysLoaded: new Map<string, IChannelFactory>(),
				delayLoaded: new Map<string, IDelayLoadChannelFactory>(),
			},
		);
		for (const factory of allFactories.alwaysLoaded.values()) {
			if (!sharedObjects.some((f) => f.type === factory.type)) {
				// User did not register this factory
				sharedObjects.push(factory);
			}
		}
		for (const factory of allFactories.delayLoaded.values()) {
			if (!sharedObjects.some((f) => f.type === factory.type)) {
				// User did not register this factory
				sharedObjects.push(factory);
			}
		}

		// Wrap the provided ctor so we can inject modelDescriptors into MultiFormatDataObject-derived classes
		// without changing the expected single-arg constructor signature seen by PureDataObjectFactory.
		const originalCtor = props.ctor;
		function forwardingCtor(p: IDataObjectProps<I>): TObj {
			return new originalCtor(p, props.modelDescriptors);
		}
		// Forward 'new' calls while producing an instance of originalCtor.
		(forwardingCtor as unknown as { prototype: object }).prototype = (
			originalCtor as unknown as { prototype: object }
		).prototype;
		// Cast through unknown so the callable wrapper can satisfy the construct signature with optional second param.
		const typedForwardingCtor = forwardingCtor as unknown as typeof props.ctor;

		//* TODO: Since we're looking up to the ContainerRuntime to handle the "migration protocol" (barrier ops, etc),
		//* we probably will drop these mixins here.
		//* See comments around call to this.parentContext.migrationProtocolBroker.readyToMigrate in DataStoreContext
		super({
			...props,
			ctor: typedForwardingCtor,
			sharedObjects,
			//* afterBindRuntime: fullMigrateDataObject,
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

	public async instantiateForMigration(
		context: IFluidDataStoreContext,
		portableData: unknown,
	): Promise<IFluidDataStoreChannel> {
		throw new Error("Use migrate instead");
	}

	//* This shows a flaw in the design - if the target is dynamic, we can't have a typed for TNewModel.
	private getTargetModelDescriptor(
		context: IFluidDataStoreContext,
	): ModelDescriptor<TUniversalView> {
		const scope: FluidObject<IFluidDependencySynthesizer> = context.scope;
		const providers =
			scope.IFluidDependencySynthesizer?.synthesize<I["OptionalProviders"]>(
				this.props.optionalProviders ?? {},
				{},
			) ??
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			({} as AsyncFluidObjectProvider<never>);

		return this.props.modelDescriptors[0];
	}

	public async migrate(
		context: IFluidDataStoreContext,
		runtime: IFluidDataStoreChannel,
		portableData: unknown, //* TODO: Revisit typing of this throughout
	): Promise<IFluidDataStoreChannel> {
		//* TODO: Avoid this cast?
		const realRuntime = runtime as FluidDataStoreRuntime;

		const targetDescriptor = this.getTargetModelDescriptor(context);

		// Create the target model and run migration.
		await targetDescriptor.ensureFactoriesLoaded();
		const newModel = targetDescriptor.create(realRuntime);
		this.props.migrateDataObject(realRuntime, newModel, portableData as TMigrationData);

		const dataObject = (await realRuntime.entryPoint.get()) as TObj;
		await dataObject.finishInitialization(true);

		//* TODO: evacuate old model
		//* i.e. delete unused root contexts, but not only that.  GC doesn't run sub-DataStore.
		//* So we will need to plumb through now-unused channels to here.  Can be a follow-up.

		return runtime;
	}

	//* Clean up after confirming we can get at settings from IMigrationInfo

	// /**
	//  * ! TODO
	//  * @remarks Assumption is that the IFluidDataStoreContext will remain constant for the lifetime of a given MigrationDataObjectFactory instance
	//  */
	// protected override async observeCreateDataObject(createProps: {
	// 	context: IFluidDataStoreContext;
	// 	optionalProviders: FluidObjectSymbolProvider<I["OptionalProviders"]>;
	// }): Promise<void> {
	// 	if (this.canPerformMigration === undefined) {
	// 		const scope: FluidObject<IFluidDependencySynthesizer> = createProps.context.scope;
	// 		const providers =
	// 			scope.IFluidDependencySynthesizer?.synthesize<I["OptionalProviders"]>(
	// 				createProps.optionalProviders,
	// 				{},
	// 			) ??
	// 			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	// 			({} as AsyncFluidObjectProvider<never>);

	// 		this.canPerformMigration = await this.props.canPerformMigration(providers);
	// 	}
	// }
}
