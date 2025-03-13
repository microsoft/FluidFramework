/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/core-utils/internal";
import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import {
	SharedMap,
	DirectoryFactory,
	MapFactory,
	// eslint-disable-next-line import/no-deprecated
	SharedDirectory,
	type ISharedDirectory,
} from "@fluidframework/map/internal";
import type {
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import type { FluidObjectSymbolProvider } from "@fluidframework/synthesize/internal";

import {
	type DataObject,
	type DataObjectTypes,
	type IDataObjectProps,
	dataObjectRootDirectoryId,
} from "../data-objects/index.js";

import { PureDataObjectFactory } from "./pureDataObjectFactory.js";

/**
 * DataObjectFactory is the IFluidDataStoreFactory for use with DataObjects.
 * It facilitates DataObject's features (such as its shared directory) by
 * ensuring relevant shared objects etc are available to the factory.
 *
 * @typeParam TObj - DataObject (concrete type)
 * @typeParam I - The input types for the DataObject
 * @legacy
 * @alpha
 */
export class DataObjectFactory<
	TObj extends DataObject<I>,
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObjectFactory<TObj, I> {
	public constructor(
		type: string,
		ctor: new (props: IDataObjectProps<I>) => TObj,
		sharedObjects: readonly IChannelFactory[] = [],
		optionalProviders: FluidObjectSymbolProvider<I["OptionalProviders"]>,
		registryEntries?: NamedFluidDataStoreRegistryEntries,
		runtimeFactory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
		convertDataFn?: (runtime: FluidDataStoreRuntime, root: ISharedDirectory) => Promise<void>,
	) {
		const mergedObjects = [...sharedObjects];

		if (!sharedObjects.some((factory) => factory.type === DirectoryFactory.Type)) {
			// User did not register for directory
			// eslint-disable-next-line import/no-deprecated
			mergedObjects.push(SharedDirectory.getFactory());
		}

		// TODO: Remove SharedMap factory when compatibility with SharedMap DataObject is no longer needed in 0.10
		if (!sharedObjects.some((factory) => factory.type === MapFactory.Type)) {
			// User did not register for map
			mergedObjects.push(SharedMap.getFactory());
		}

		let converted = false;
		const convertRoundTripP = new Deferred<void>();

		const fullConvertDataFn =
			convertDataFn === undefined
				? undefined
				: async (runtime: FluidDataStoreRuntime) => {
						if (!converted) {
							converted = true;
							submitConversionOp(runtime);
							await convertRoundTripP.promise;

							const root = (await runtime.getChannel(
								dataObjectRootDirectoryId,
							)) as ISharedDirectory;
							await convertDataFn(runtime, root);
						}
					};

		const submitConversionOp = (runtime: FluidDataStoreRuntime): void => {
			runtime.submitMessage(DataStoreMessageType.ChannelOp, "conversion", undefined);
		};

		super(
			type,
			ctor,
			mergedObjects,
			optionalProviders,
			registryEntries,
			class ConverterDataStoreRuntime extends runtimeFactory {
				public processMessages(messageCollection: IRuntimeMessageCollection): void {
					let contents: IRuntimeMessagesContent[] = [];
					// eslint-disable-next-line unicorn/prefer-ternary
					if (
						fullConvertDataFn !== undefined &&
						// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
						messageCollection.envelope.type === DataStoreMessageType.ChannelOp
					) {
						if (
							messageCollection.messagesContent.some((val) => val.contents === "conversion")
						) {
							convertRoundTripP.resolve();
						}

						contents = messageCollection.messagesContent.filter(
							(val) => typeof val.contents !== "string" || val.contents !== "conversion",
						);
					} else {
						contents = [...messageCollection.messagesContent];
					}

					if (contents.length === 0) {
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
						fullConvertDataFn !== undefined &&
						// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
						type2 === DataStoreMessageType.ChannelOp &&
						content === "conversion"
					) {
						submitConversionOp(this);
						return;
					}
					super.reSubmit(type2, content, localOpMetadata);
				}
			},
			fullConvertDataFn,
		);
	}
}
