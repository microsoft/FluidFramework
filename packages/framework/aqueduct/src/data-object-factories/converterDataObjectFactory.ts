/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import type {
	IFluidDataStoreChannel,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";

import {
	type DataObject,
	type DataObjectTypes,
	type PureDataObject,
	dataObjectRootDirectoryId,
} from "../data-objects/index.js";

import { DataObjectFactory } from "./dataObjectFactory.js";
import type { DataObjectFactoryProps } from "./pureDataObjectFactory.js";

/**
 * Represents the properties required to create a ConverterDataObjectFactory.
 * @legacy
 * @alpha
 */
export interface ConverterDataObjectFactoryProps<
	TObj extends PureDataObject<I>,
	TConversionData,
	I extends DataObjectTypes = DataObjectTypes,
> extends DataObjectFactoryProps<TObj, I> {
	/**
	 * Used for determining whether or not a conversion is necessary based on the current state.
	 *
	 * An example might look like:
	 * ```
	 * async (root) => {
	 *     // Check if "mapKey" has been removed from the SharedDirectory. The presence of this key tells us if the conversion has happened or not (see `convertDataObject`)
	 *     return root.get<IFluidHandle<SharedMap>>("mapKey") !== undefined;
	 * }
	 * ```
	 */
	isConversionNeeded: (root: ISharedDirectory) => Promise<boolean>;

	/**
	 * Data required for running conversion. This is necessary because the conversion must happen synchronously.
	 *
	 * An example of what to asynchronously retrieve could be getting the "old" DDS that you want to convert the data of:
	 * ```
	 * async (root) => {
	 *     root.get<IFluidHandle<SharedMap>>("mapKey").get();
	 * }
	 * ```
	 */
	asyncGetDataForConversion: (root: ISharedDirectory) => Promise<TConversionData>;

	/**
	 * Convert the DataObject upon resolve (i.e. on retrieval of the DataStore).
	 *
	 * An example implementation could be changing which underlying DDS is used to represent the DataObject's data:
	 * ```
	 * (runtime, root, data) => {
	 *     // ! These are not all real APIs and are simply used to convey the purpose of this method
	 *     const mapContent = data.getContent();
	 *     const newDirectory = SharedDirectory.create(runtime);
	 *     newDirectory.populateContent(mapContent);
	 *     root.set("directoryKey", newDirectory.handle);
	 *     root.delete("mapKey");
	 * }
	 * ```
	 * @param data - Provided by the "asyncGetDataForConversion" function
	 */
	convertDataObject: (
		runtime: FluidDataStoreRuntime,
		root: ISharedDirectory,
		data: TConversionData,
	) => void;

	/**
	 * If not provided, the Container will be closed after conversion due to underlying changes affecting the data model.
	 */
	refreshDataObject?: () => Promise<void>;
}

/**
 * TODO
 * @legacy
 * @alpha
 */
export class ConverterDataObjectFactory<
	TObj extends DataObject<I>,
	TConversionData,
	I extends DataObjectTypes = DataObjectTypes,
> extends DataObjectFactory<TObj, I> {
	private convertLock = false;

	public constructor(props: ConverterDataObjectFactoryProps<TObj, TConversionData, I>) {
		const fullConvertDataStore = async (runtime: IFluidDataStoreChannel): Promise<void> => {
			const realRuntime = runtime as FluidDataStoreRuntime;
			const root = (await realRuntime.getChannel(
				dataObjectRootDirectoryId,
			)) as ISharedDirectory;
			if (!this.convertLock && (await props.isConversionNeeded(root))) {
				this.convertLock = true;
				const data = await props.asyncGetDataForConversion(root);

				realRuntime.maintainOnlyLocal?.(() => {
					realRuntime.orderSequentially?.(() => {
						submitConversionOp(realRuntime);
						props.convertDataObject(realRuntime, root, data);
					});
				});
				this.convertLock = false;
			}
		};

		const submitConversionOp = (runtime: FluidDataStoreRuntime): void => {
			runtime.submitMessage(DataStoreMessageType.ChannelOp, "conversion", undefined);
		};

		const runtimeClass = props.runtimeClass ?? FluidDataStoreRuntime;

		super({
			...props,
			convertDataStore: fullConvertDataStore,
			runtimeClass: class ConverterDataStoreRuntime extends runtimeClass {
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
		});
	}
}
