/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import {
	DirectoryFactory,
	SharedDirectory,
	type ISharedDirectory,
} from "@fluidframework/map/internal";
import type {
	IFluidDataStoreChannel,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";

import {
	type DataObjectTypes,
	type PureDataObject,
	type TreeDataObject,
	dataObjectRootDirectoryId,
} from "../data-objects/index.js";

import type { DataObjectFactoryProps } from "./pureDataObjectFactory.js";
import { TreeDataObjectFactory } from "./treeDataObjectFactory.js";

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
	convertDataObject: (runtime: FluidDataStoreRuntime, data: TConversionData) => void;

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
	TObj extends TreeDataObject<I>,
	TConversionData,
	I extends DataObjectTypes = DataObjectTypes,
> extends TreeDataObjectFactory<TObj, I> {
	private convertLock = false;

	public constructor(props: ConverterDataObjectFactoryProps<TObj, TConversionData, I>) {
		const runtimeType = props.runtimeClass ?? FluidDataStoreRuntime;
		const runtimeClass = class ConverterDataStoreRuntime extends runtimeType {
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

			public removeRoot(): void {
				this.contexts.delete("root");
			}
		};

		const fullConvertDataStore = async (channel: IFluidDataStoreChannel): Promise<void> => {
			const runtime = channel as FluidDataStoreRuntime;
			const root = (await runtime.getChannel(dataObjectRootDirectoryId)) as ISharedDirectory;
			if (!this.convertLock && root.attributes.type === DirectoryFactory.Type) {
				this.convertLock = true;
				const data = await props.asyncGetDataForConversion(root);

				runtime.maintainOnlyLocal?.(() => {
					runtime.orderSequentially?.(() => {
						submitConversionOp(runtime);
						// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
						(runtime as any).removeRoot();
						props.convertDataObject(runtime, data);
					});
				});
				this.convertLock = false;
			}
		};

		const submitConversionOp = (runtime: FluidDataStoreRuntime): void => {
			runtime.submitMessage(DataStoreMessageType.ChannelOp, "conversion", undefined);
		};

		const sharedObjects = [...(props.sharedObjects ?? [])];

		if (!sharedObjects.some((factory) => factory.type === DirectoryFactory.Type)) {
			// User did not register for directory
			sharedObjects.push(SharedDirectory.getFactory());
		}

		super({
			...props,
			convertDataStore: fullConvertDataStore,
			runtimeClass,
			sharedObjects,
		});
	}
}
