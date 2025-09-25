/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces";
import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type {
	IFluidDataStoreChannel,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";

import type { IDelayLoadChannelFactory } from "../channel-factories/index.js";
import type {
	DataObjectTypes,
	IProvideMigrationInfo,
	MigrationDataObject,
	ModelDescriptor,
} from "../data-objects/index.js";

import {
	PureDataObjectFactory,
	type DataObjectFactoryProps,
} from "./pureDataObjectFactory.js";

/**
 * MigrationDataObjectFactory is the IFluidDataStoreFactory for migrating DataObjects.
 * See MigrationDataObjectFactoryProps for more information on how to utilize this factory.
 *
 * @experimental
 * @legacy
 * @beta
 */
export class MigrationDataObjectFactory<
	TObj extends MigrationDataObject<TUniversalView, I, TMigrationData>,
	TUniversalView,
	I extends DataObjectTypes = DataObjectTypes,
	TMigrationData = never, // default case works for a single model descriptor (migration is not needed)
> extends PureDataObjectFactory<TObj, I> {
	public constructor(
		props: DataObjectFactoryProps<TObj, I>,
		modelDescriptors: readonly ModelDescriptor<TUniversalView>[],
	) {
		const alteredProps = getAlteredPropsSupportingMigrationDataObject(
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- //* FIX THE TYPES
			props as any,
			modelDescriptors,
		);
		super(alteredProps as unknown as DataObjectFactoryProps<TObj, I>);
	}
}

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
	// Ensure all shared object factories from all model descriptors are included in the factory props
	const sharedObjects = [...(props.sharedObjects ?? [])];
	coallesceSharedObjects(sharedObjects, modelDescriptors);

	const transformedProps = {
		...props,
		sharedObjects,
		afterBindRuntime: fullMigrateDataObject,
		runtimeClass: mixinMigrationSupport(props.runtimeClass ?? FluidDataStoreRuntime),
	};

	return transformedProps;
}

function coallesceSharedObjects(
	sharedObjects: IChannelFactory[],
	modelDescriptors: readonly ModelDescriptor[],
): void {
	//* TODO: Maybe we don't need to split by delay-loaded here (and in ModelDescriptor type)
	const allFactories: {
		alwaysLoaded: Map<string, IChannelFactory>;
		delayLoaded: Map<string, IDelayLoadChannelFactory>;
		// eslint-disable-next-line unicorn/no-array-reduce
	} = modelDescriptors.reduce(
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
}

const fullMigrateDataObject = async (runtime: IFluidDataStoreChannel): Promise<void> => {
	// The old EntryPoint being migrated away from needs to provide IMigrationInfo
	const maybeMigrationSource: FluidObject<IProvideMigrationInfo> =
		await runtime.entryPoint.get();

	const migrationInfo = maybeMigrationSource.IMigrationInfo;
	if (migrationInfo === undefined) {
		// No migration needed if MigrationInfo not provided
		return;
	}

	await migrationInfo.migrate();
};

const ConversionContent = "conversion";

//* TODO: Dedupe as much as possible with MigrationDataObject's version
const submitConversionOp = (runtime: FluidDataStoreRuntime): void => {
	runtime.submitMessage(DataStoreMessageType.ChannelOp, ConversionContent, undefined);
};

function mixinMigrationSupport(
	runtimeClass: typeof FluidDataStoreRuntime,
): typeof FluidDataStoreRuntime {
	return class MigratorDataStoreRuntime extends runtimeClass {
		private migrationOpSeqNum = -1;
		private readonly seqNumsToSkip = new Set<number>();

		public processMessages(messageCollection: IRuntimeMessageCollection): void {
			let contents: IRuntimeMessagesContent[] = [];
			const sequenceNumber = messageCollection.envelope.sequenceNumber;

			// ! TODO: add loser validation AB#41626
			if (
				// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
				messageCollection.envelope.type === DataStoreMessageType.ChannelOp &&
				messageCollection.messagesContent.some((val) => val.contents === ConversionContent)
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
				(val) => val.contents !== ConversionContent,
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
			if (type === DataStoreMessageType.ChannelOp && content === ConversionContent) {
				submitConversionOp(this);
				return;
			}
			super.reSubmit(type, content, localOpMetadata);
		}

		//* TODO: Replace with generic "evacuate" function on ModelDescriptor
		public removeRoot(): void {
			//* this.contexts.delete(dataObjectRootDirectoryId);
		}
	};
}
