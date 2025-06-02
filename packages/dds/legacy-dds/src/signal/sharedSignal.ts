/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import { FileMode, MessageType, TreeEntry } from "@fluidframework/driver-definitions/internal";
import type {
	ISequencedDocumentMessage,
	ITree,
} from "@fluidframework/driver-definitions/internal";
import type { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import { convertToSummaryTreeWithStats } from "@fluidframework/runtime-utils/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import { SharedObject } from "@fluidframework/shared-object-base/internal";

import type {
	ISharedSignal,
	ISharedSignalEvents,
	ISignalOperation,
	SerializableTypeForSharedSignal,
} from "./interfaces.js";
import { SharedSignalFactory } from "./sharedSignalFactory.js";

const snapshotFileName = "header";

/**
 * Represents a shared signal that allows communication between distributed clients.
 *
 * @internal
 */
export class SharedSignalClass<T extends SerializableTypeForSharedSignal = any>
	extends SharedObject<ISharedSignalEvents<T>>
	implements ISharedSignal<T>
{
	/**
	 * Create a new shared signal
	 *
	 * @param runtime - data store runtime the new shared signal belongs to
	 * @param id - optional name of the shared signal
	 * @returns newly create shared signal (but not attached yet)
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedSignalClass {
		return runtime.createChannel(id, SharedSignalFactory.Type) as SharedSignalClass;
	}

	/**
	 * Get a factory for SharedSignal to register with the data store.
	 *
	 * @returns a factory that creates and load SharedSignal
	 */
	public static getFactory(): IChannelFactory {
		return new SharedSignalFactory();
	}

	/**
	 * Constructs a new shared signal. If the object is non-local an id and service interfaces will
	 * be provided
	 * @param id - optional name of the shared signal
	 * @param runtime - data store runtime the shared signal belongs to
	 * @param attributes - represents the attributes of a channel/DDS.
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "loop_sharedSignal_" /* telemetryContextPrefix */);
	}

	/**
	 * Method used for generating a signal.
	 */
	public notify(metadata?: T): void {
		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		const op: ISignalOperation<T> = {
			type: "signal",
			metadata,
		};

		this.notifyCore(op, true);

		this.submitLocalMessage(op);
	}

	protected summarizeCore(_serializer: IFluidSerializer): ISummaryTreeWithStats {
		const tree: ITree = {
			entries: [
				{
					mode: FileMode.File,
					path: snapshotFileName,
					type: TreeEntry[TreeEntry.Blob],
					value: {
						contents: JSON.stringify(""),
						// eslint-disable-next-line unicorn/text-encoding-identifier-case
						encoding: "utf-8",
					},
				},
			],
		};

		const summaryTreeWithStats = convertToSummaryTreeWithStats(tree);

		return summaryTreeWithStats;
	}

	/**
	 * Load share signal from snapshot
	 *
	 * @param _storage - the storage to get the snapshot from
	 * @returns - promise that resolved when the load is completed
	 */
	protected async loadCore(_storage: IChannelStorageService): Promise<void> {}

	protected override initializeLocalCore(): void {}

	/**
	 * Callback on disconnect
	 */
	protected onDisconnect(): void {}

	/**
	 * Process a shared signal operation
	 *
	 * @param message - the message to prepare
	 * @param local - whether the message was sent by the local client
	 * @param _localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		_localOpMetadata: unknown,
	): void {
		if ((message.type as MessageType) === MessageType.Operation && !local) {
			const op = message.contents as ISignalOperation<T>;

			switch (op.type) {
				case "signal": {
					this.notifyCore(op, local);
					break;
				}

				default: {
					throw new Error("Unknown operation");
				}
			}
		}
	}

	private notifyCore(op: ISignalOperation<T>, isLocal: boolean): void {
		this.emit("notify", op.metadata, isLocal);
	}

	protected applyStashedOp(_content: unknown): void {
		throw new Error("Not implemented");
	}
}
