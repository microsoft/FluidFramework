/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
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

import { DataObjectFactory } from "./dataObjectFactory.js";

/**
 * TODO
 * @legacy
 * @alpha
 */
export class ConverterDataObjectFactory<
	TObj extends DataObject<I>,
	U,
	I extends DataObjectTypes = DataObjectTypes,
> extends DataObjectFactory<TObj, I> {
	private convertLock = false;

	public constructor(
		type: string,
		ctor: new (props: IDataObjectProps<I>) => TObj,
		sharedObjects: readonly IChannelFactory[] = [],
		optionalProviders: FluidObjectSymbolProvider<I["OptionalProviders"]>,
		isConversionNeeded: (root: ISharedDirectory) => Promise<boolean>,
		asyncGetDataForConversion: (root: ISharedDirectory) => Promise<U>,
		convertDataStore: (
			runtime: FluidDataStoreRuntime,
			root: ISharedDirectory,
			data: U,
		) => void,
		registryEntries?: NamedFluidDataStoreRegistryEntries,
		runtimeFactory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
	) {
		const fullConvertDataStore = async (runtime: FluidDataStoreRuntime): Promise<void> => {
			const root = (await runtime.getChannel(dataObjectRootDirectoryId)) as ISharedDirectory;
			if (!this.convertLock && (await isConversionNeeded(root))) {
				this.convertLock = true;
				const data = await asyncGetDataForConversion(root);

				runtime.maintainOnlyLocal?.(() => {
					runtime.orderSequentially?.(() => {
						submitConversionOp(runtime);
						convertDataStore(runtime, root, data);
					});
				});
				this.convertLock = false;
			}
		};

		const submitConversionOp = (runtime: FluidDataStoreRuntime): void => {
			runtime.submitMessage(DataStoreMessageType.ChannelOp, "conversion", undefined);
		};

		super(
			type,
			ctor,
			sharedObjects,
			optionalProviders,
			registryEntries,
			class ConverterDataStoreRuntime extends runtimeFactory {
				private conversionOpSeqNum = -1;
				private readonly seqNumsToSkip = new Set<number>();

				public processMessages(messageCollection: IRuntimeMessageCollection): void {
					let contents: IRuntimeMessagesContent[] = [];
					const sequenceNumber = messageCollection.envelope.sequenceNumber;

					// ! TODO: extra validation if this client submitted "conversion" op but lost the race (close/reload Container if lost the race)
					if (
						// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
						messageCollection.envelope.type === DataStoreMessageType.ChannelOp &&
						messageCollection.messagesContent.some((val) => val.contents === "conversion")
					) {
						if (this.conversionOpSeqNum === -1) {
							// This is the first conversion op we've seen
							this.conversionOpSeqNum = sequenceNumber;
						} else {
							// Skip seqNums that lost the race
							this.seqNumsToSkip.add(sequenceNumber);
						}
					}

					contents = messageCollection.messagesContent.filter(
						(val) => val.contents !== "conversion",
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
						content === "conversion"
					) {
						submitConversionOp(this);
						return;
					}
					super.reSubmit(type2, content, localOpMetadata);
				}
			},
			fullConvertDataStore,
		);
	}
}
