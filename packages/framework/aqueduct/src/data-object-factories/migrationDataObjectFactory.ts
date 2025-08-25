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
import type { ISharedDirectory } from "@fluidframework/map/internal";
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
import type { ITree } from "@fluidframework/tree";

import type { IDelayLoadChannelFactory } from "../channel-factories/index.js";
import {
	type DataObjectTypes,
	type MigrationDataObject,
	dataObjectRootDirectoryId,
	treeChannelId,
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
	TObj extends MigrationDataObject<I>,
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
	asyncGetDataForMigration: (root: ISharedDirectory) => Promise<TMigrationData>;

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
		treeRoot: ITree,
		data: TMigrationData,
	) => void;

	/**
	 * If not provided, the Container will be closed after migration due to underlying changes affecting the data model.
	 */
	refreshDataObject?: () => Promise<void>;

	/**
	 * ! TODO
	 */
	treeDelayLoadFactory: IDelayLoadChannelFactory<ITree>;
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
	TObj extends MigrationDataObject<I>,
	TMigrationData,
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObjectFactory<TObj, I> {
	private migrateLock = false;

	// ! TODO: add new DataStoreMessageType.Conversion
	private static readonly conversionContent = "conversion";

	public constructor(
		private readonly props: MigrationDataObjectFactoryProps<TObj, TMigrationData, I>,
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
			try {
				// ! If we are able to retrieve a tree at the root, then migration has already happened
				await realRuntime.getChannel(treeChannelId);
				// eslint-disable-next-line unicorn/prefer-optional-catch-binding
			} catch (_) {
				assert(
					this.canPerformMigration !== undefined,
					"Expected canPerformMigration to be set",
				);

				const root = (await realRuntime.getChannel(
					dataObjectRootDirectoryId,
				)) as ISharedDirectory;

				if (this.canPerformMigration && !this.migrateLock) {
					this.migrateLock = true;
					const data = await props.asyncGetDataForMigration(root);
					await props.treeDelayLoadFactory.loadObjectKindAsync();

					// ! TODO: ensure these ops aren't sent immediately AB#41625
					submitConversionOp(realRuntime);
					const treeRoot = props.treeDelayLoadFactory.create(realRuntime, treeChannelId);
					props.migrateDataObject(realRuntime, treeRoot, data);
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(runtime as any).removeRoot();
					this.migrateLock = false;
				}
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
					type2: DataStoreMessageType,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					content: any,
					localOpMetadata: unknown,
				): void {
					if (
						// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
						type2 === DataStoreMessageType.ChannelOp &&
						content === MigrationDataObjectFactory.conversionContent
					) {
						submitConversionOp(this);
						return;
					}
					super.reSubmit(type2, content, localOpMetadata);
				}

				public removeRoot(): void {
					this.contexts.delete(dataObjectRootDirectoryId);
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
