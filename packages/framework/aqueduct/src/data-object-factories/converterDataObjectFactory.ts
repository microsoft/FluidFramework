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
 * @internal
 */
export interface ConverterDataObjectFactoryProps<
	TObj extends PureDataObject<I>,
	TConversionData,
	I extends DataObjectTypes = DataObjectTypes,
> extends DataObjectFactoryProps<TObj, I> {
	/**
	 * Used for determining whether or not a conversion is necessary based on the current state.
	 */
	isConversionNeeded: (root: ISharedDirectory) => Promise<boolean>;

	/**
	 * Data required for running conversion. This is necessary because the conversion must happen synchronously.
	 */
	asyncGetDataForConversion: (root: ISharedDirectory) => Promise<TConversionData>;

	/**
	 * Convert the DataObject upon resolve (i.e. on retrieval of the DataStore).
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
 * ConverterDataObjectFactory is the IFluidDataStoreFactory for converting DataObjects.
 * See ConverterDataObjectFactoryProps for more information on how to utilize this factory.
 *
 * @internal
 */
export class ConverterDataObjectFactory<
	TObj extends DataObject<I>,
	TConversionData,
	I extends DataObjectTypes = DataObjectTypes,
> extends DataObjectFactory<TObj, I> {
	private convertLock = false;

	public constructor(props: ConverterDataObjectFactoryProps<TObj, TConversionData, I>) {
		const submitConversionOp = (runtime: FluidDataStoreRuntime): void => {
			// ! TODO: potentially add new DataStoreMessageType.Conversion
			runtime.submitMessage(DataStoreMessageType.ChannelOp, "conversion", undefined);
		};

		const fullConvertDataStore = async (runtime: IFluidDataStoreChannel): Promise<void> => {
			const realRuntime = runtime as FluidDataStoreRuntime;
			const root = (await realRuntime.getChannel(
				dataObjectRootDirectoryId,
			)) as ISharedDirectory;
			if (!this.convertLock && (await props.isConversionNeeded(root))) {
				this.convertLock = true;
				const data = await props.asyncGetDataForConversion(root);

				// ! TODO: ensure these ops aren't sent immediately AB#41625
				submitConversionOp(realRuntime);
				props.convertDataObject(realRuntime, root, data);
				this.convertLock = false;
			}
		};

		const runtimeClass = props.runtimeClass ?? FluidDataStoreRuntime;

		super({
			...props,
			afterBindRuntime: fullConvertDataStore,
			runtimeClass: class ConverterDataStoreRuntime extends runtimeClass {
				private conversionOpSeqNum = -1;
				private readonly seqNumsToSkip = new Set<number>();

				public processMessages(messageCollection: IRuntimeMessageCollection): void {
					let contents: IRuntimeMessagesContent[] = [];
					const sequenceNumber = messageCollection.envelope.sequenceNumber;

					// ! TODO: add loser validation AB#41626
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
