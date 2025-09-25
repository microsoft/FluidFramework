/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces";
import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import type {
	IFluidDataStoreChannel,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";

//* TEST only, will remove
// eslint-disable-next-line import/no-internal-modules
import { rootDirectoryDescriptor } from "../data-objects/dataObject.js";
import {
	DataObject,
	type DataObjectTypes,
	type IDataObjectProps,
	type MigrationDataObject,
	type ModelDescriptor,
} from "../data-objects/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rootSharedTreeDescriptor } from "../data-objects/treeDataObject.js";

import type { DataObjectFactoryProps } from "./pureDataObjectFactory.js";

/**
 * Represents the properties required to create a MigrationDataObjectFactory.
 * @experimental
 * @legacy
 * @beta
 */
export interface MigrationDataObjectFactoryProps<
	TObj extends MigrationDataObject<TUniversalView, I, TMigrationData>,
	TUniversalView,
	I extends DataObjectTypes = DataObjectTypes,
	TNewModel extends TUniversalView = TUniversalView, // default case works for a single model descriptor
	TMigrationData = never, // default case works for a single model descriptor (migration is not needed)
> extends DataObjectFactoryProps<TObj, I> {
	/**
	 * The constructor for the data object, which must also include static `modelDescriptors` property.
	 */
	ctor: (new (
		props: IDataObjectProps<I>,
	) => TObj) & {
		//* TODO: Add type alias for this array type
		modelDescriptors: readonly [
			ModelDescriptor<TNewModel>,
			...ModelDescriptor<TUniversalView>[],
		];
	};
}

//* STUB
interface IProvideMigrationInfo {
	IMigrationInfo?: IProvideMigrationInfo;
	migrate: () => Promise<void>;
}

const fullMigrateDataObject = async (runtime: IFluidDataStoreChannel): Promise<void> => {
	//* 1. Get the entrypoint (it will not fully init if pending migration)
	//* 2. Tell it to migrate if needed.
	//     a. Check if we're ready to migrate per barrier op
	//     b. It will prepare for migration async
	//     c. It will submit a "conversion" op and do the migration in a synchronous callback using runtime helper to hold ops in PSM
	//     d. At the end, it should finish initializing.

	// The old EntryPoint being migrated away from needs to provide IMigrationInfo
	const maybeMigrationSource: FluidObject<IProvideMigrationInfo> =
		await runtime.entryPoint.get();

	const migrationInfo = maybeMigrationSource.IMigrationInfo;
	if (migrationInfo === undefined) {
		// No migration needed if MigrationInfo not provided
		return;
	}

	//* Pseudo-code
	await migrationInfo.migrate();
};

const conversionContent = "conversion";

/**
 * Shallow copies the props making necesssary alterations so PureDataObjectFactory can be used to create a MigrationDataObject
 */
export function getAlteredPropsSupportingMigrationDataObject<
	TObj extends MigrationDataObject<TUniversalView, I, TMigrationData>,
	TUniversalView = unknown,
	I extends DataObjectTypes = DataObjectTypes,
	TMigrationData = never, // default case works for a single model descriptor (migration is not needed)
>(
	props: DataObjectFactoryProps<TObj, I>,
	modelDescriptors: readonly ModelDescriptor[],
): DataObjectFactoryProps<TObj, I> {
	const allSharedObjects = modelDescriptors.flatMap(
		(desc) => desc.sharedObjects.alwaysLoaded ?? [],
	); //* PSUEDO-CODE (see BONEYARD below for more complex version)

	const runtimeClass = props.runtimeClass ?? FluidDataStoreRuntime;

	const transformedProps = {
		...props,
		sharedObjects: [...allSharedObjects, ...(props.sharedObjects ?? [])],
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
					messageCollection.messagesContent.some((val) => val.contents === conversionContent)
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
					(val) => val.contents !== conversionContent,
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
				if (type === DataStoreMessageType.ChannelOp && content === conversionContent) {
					//* submitConversionOp(this);
					return;
				}
				super.reSubmit(type, content, localOpMetadata);
			}

			//* TODO: Replace with generic "evacuate" function on ModelDescriptor
			public removeRoot(): void {
				//* this.contexts.delete(dataObjectRootDirectoryId);
			}
		}, //* Mixin the Migration op processing stuff
	};

	return transformedProps;
}

class MyDataObject extends DataObject {}

getAlteredPropsSupportingMigrationDataObject(
	{ type: "test", ctor: MyDataObject, sharedObjects: [] /* ...other props... */ },
	[rootSharedTreeDescriptor(), rootDirectoryDescriptor],
);

//* BONEYARD
// //* TODO: Maybe we don't need to split by delay-loaded here (and in ModelDescriptor type)
// const allFactories: {
// 	alwaysLoaded: Map<string, IChannelFactory>;
// 	delayLoaded: Map<string, IDelayLoadChannelFactory>;
// 	// eslint-disable-next-line unicorn/no-array-reduce
// } = props.ctor.modelDescriptors.reduce(
// 	(acc, curr) => {
// 		for (const factory of curr.sharedObjects.alwaysLoaded ?? []) {
// 			acc.alwaysLoaded.set(factory.type, factory);
// 		}
// 		for (const factory of curr.sharedObjects.delayLoaded ?? []) {
// 			acc.delayLoaded.set(factory.type, factory);
// 		}
// 		return acc;
// 	},
// 	{
// 		alwaysLoaded: new Map<string, IChannelFactory>(),
// 		delayLoaded: new Map<string, IDelayLoadChannelFactory>(),
// 	},
// );
// for (const factory of allFactories.alwaysLoaded.values()) {
// 	if (!sharedObjects.some((f) => f.type === factory.type)) {
// 		// User did not register this factory
// 		sharedObjects.push(factory);
// 	}
// }
// for (const factory of allFactories.delayLoaded.values()) {
// 	if (!sharedObjects.some((f) => f.type === factory.type)) {
// 		// User did not register this factory
// 		sharedObjects.push(factory);
// 	}
// }
