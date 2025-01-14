/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	Serializable,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import {
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type {
	ISummaryTreeWithStats,
	AttributionKey,
} from "@fluidframework/runtime-definitions/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

import type {
	ICellLocalOpMetadata,
	ICellOptions,
	ISharedCell,
	ISharedCellEvents,
} from "./interfaces.js";

/**
 * Description of a cell delta operation
 */
type ICellOperation = ISetCellOperation | IDeleteCellOperation;

interface ISetCellOperation {
	type: "setCell";
	value: ICellValue;
}

interface IDeleteCellOperation {
	type: "deleteCell";
}

interface ICellValue {
	/**
	 * The actual value contained in the `Cell`, which needs to be wrapped to handle `undefined`.
	 */
	value: unknown;
	/**
	 * The attribution key contained in the `Cell`.
	 */
	attribution?: AttributionKey;
}

const snapshotFileName = "header";

/**
 * {@inheritDoc ISharedCell}
 */
// TODO: use `unknown` instead (breaking change).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class SharedCell<T = any>
	extends SharedObject<ISharedCellEvents<T>>
	implements ISharedCell<T>
{
	/**
	 * The data held by this cell.
	 */
	private data: Serializable<T> | undefined;

	/**
	 * This is used to assign a unique id to outgoing messages. It is used to track messages until
	 * they are ack'd.
	 */
	private messageId: number = -1;

	/**
	 * This keeps track of the messageId of messages that have been ack'd. It is updated every time
	 * we a message is ack'd with it's messageId.
	 */
	private messageIdObserved: number = -1;

	private readonly pendingMessageIds: number[] = [];

	private attribution: AttributionKey | undefined;

	private readonly options: ICellOptions | undefined;

	/**
	 * Constructs a new `SharedCell`.
	 * If the object is non-local an id and service interfaces will be provided.
	 *
	 * @param runtime - The data store runtime to which the `SharedCell` belongs.
	 * @param id - Unique identifier for the `SharedCell`.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
	constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
		super(id, runtime, attributes, "fluid_cell_");

		this.options = runtime.options as ICellOptions;
	}

	/**
	 * {@inheritDoc ISharedCell.get}
	 */
	public get(): Serializable<T> | undefined {
		return this.data;
	}

	/**
	 * {@inheritDoc ISharedCell.set}
	 */
	public set(value: Serializable<T>): void {
		// Set the value locally.
		const previousValue = this.setCore(value);
		this.setAttribution();

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		const operationValue: ICellValue = {
			value,
		};

		const op: ISetCellOperation = {
			type: "setCell",
			value: operationValue,
		};
		this.submitCellMessage(op, previousValue);
	}

	/**
	 * {@inheritDoc ISharedCell.delete}
	 */
	public delete(): void {
		// Delete the value locally.
		const previousValue = this.deleteCore();
		this.setAttribution();

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		const op: IDeleteCellOperation = {
			type: "deleteCell",
		};
		this.submitCellMessage(op, previousValue);
	}

	/**
	 * {@inheritDoc ISharedCell.empty}
	 */
	public empty(): boolean {
		return this.data === undefined;
	}

	/**
	 * {@inheritDoc ISharedCell.getAttribution}
	 */
	public getAttribution(): AttributionKey | undefined {
		return this.attribution;
	}

	/**
	 * Set the Op-based attribution through the SequencedDocumentMessage,
	 * or set the local/detached attribution.
	 */
	private setAttribution(message?: ISequencedDocumentMessage): void {
		if (this.options?.attribution?.track ?? false) {
			this.attribution = message
				? { type: "op", seq: message.sequenceNumber }
				: this.isAttached()
					? { type: "local" }
					: { type: "detached", id: 0 };
		}
	}

	/**
	 * Creates a summary for the Cell.
	 *
	 * @returns The summary of the current state of the Cell.
	 */
	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const content: ICellValue =
			this.attribution?.type === "local"
				? { value: this.data, attribution: undefined }
				: { value: this.data, attribution: this.attribution };
		return createSingleBlobSummary(
			snapshotFileName,
			serializer.stringify(content, this.handle),
		);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<ICellValue>(storage, snapshotFileName);

		this.data = this.serializer.decode(content.value) as Serializable<T>;
		this.attribution = content.attribution;
	}

	/**
	 * Initialize a local instance of cell.
	 */
	protected initializeLocalCore(): void {
		this.data = undefined;
	}

	/**
	 * Call back on disconnect.
	 */
	protected onDisconnect(): void {}

	/**
	 * Apply inner op.
	 *
	 * @param content - ICellOperation content
	 */
	private applyInnerOp(content: ICellOperation): Serializable<T> | undefined {
		switch (content.type) {
			case "setCell": {
				return this.setCore(content.value.value as Serializable<T>);
			}

			case "deleteCell": {
				return this.deleteCore();
			}

			default: {
				throw new Error("Unknown operation");
			}
		}
	}

	/**
	 * Process a cell operation (op).
	 *
	 * @param message - The message to prepare.
	 * @param local - Whether or not the message was sent by the local client.
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be `undefined`.
	 */
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		const cellOpMetadata = localOpMetadata as ICellLocalOpMetadata;
		if (this.messageId !== this.messageIdObserved) {
			// We are waiting for an ACK on our change to this cell - we will ignore all messages until we get it.
			if (local) {
				const messageIdReceived = cellOpMetadata.pendingMessageId;
				assert(
					messageIdReceived !== undefined && messageIdReceived <= this.messageId,
					0x00c /* "messageId is incorrect from from the local client's ACK" */,
				);
				assert(
					this.pendingMessageIds !== undefined &&
						this.pendingMessageIds[0] === cellOpMetadata.pendingMessageId,
					0x471 /* Unexpected pending message received */,
				);
				this.pendingMessageIds.shift();
				// We got an ACK. Update messageIdObserved.
				this.messageIdObserved = cellOpMetadata.pendingMessageId;
				// update the attributor
				this.setAttribution(message);
			}
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (message.type === MessageType.Operation && !local) {
			const op = message.contents as ICellOperation;
			// update the attributor
			this.setAttribution(message);
			this.applyInnerOp(op);
		}
	}

	private setCore(value: Serializable<T>): Serializable<T> | undefined {
		const previousLocalValue = this.get();
		this.data = value;
		this.emit("valueChanged", value);
		return previousLocalValue;
	}

	private deleteCore(): Serializable<T> | undefined {
		const previousLocalValue = this.get();
		this.data = undefined;
		this.emit("delete");
		return previousLocalValue;
	}

	private createLocalOpMetadata(
		op: ICellOperation,
		previousValue?: Serializable<T>,
	): ICellLocalOpMetadata {
		const pendingMessageId = ++this.messageId;
		this.pendingMessageIds.push(pendingMessageId);
		const localMetadata: ICellLocalOpMetadata = {
			pendingMessageId,
			previousValue,
		};
		return localMetadata;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
	 */
	protected applyStashedOp(content: unknown): void {
		const cellContent = content as ICellOperation;
		switch (cellContent.type) {
			case "deleteCell": {
				this.delete();
				break;
			}
			case "setCell": {
				this.set(cellContent.value.value as Serializable<T>);
				break;
			}
			default: {
				unreachableCase(cellContent);
			}
		}
	}

	/**
	 * Rollback a local op.
	 *
	 * @param content - The operation to rollback.
	 * @param localOpMetadata - The local metadata associated with the op.
	 */
	// TODO: use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
	protected rollback(content: any, localOpMetadata: unknown): void {
		const cellOpMetadata = localOpMetadata as ICellLocalOpMetadata;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if (content.type === "setCell" || content.type === "deleteCell") {
			if (cellOpMetadata.previousValue === undefined) {
				this.deleteCore();
			} else {
				this.setCore(cellOpMetadata.previousValue as Serializable<T>);
			}

			const lastPendingMessageId = this.pendingMessageIds.pop();
			if (lastPendingMessageId !== cellOpMetadata.pendingMessageId) {
				throw new Error("Rollback op does not match last pending");
			}
		} else {
			throw new Error("Unsupported op for rollback");
		}
	}

	/**
	 * Submit a cell message to remote clients.
	 *
	 * @param op - The cell message.
	 * @param previousValue - The value of the cell before this op.
	 */
	private submitCellMessage(op: ICellOperation, previousValue?: Serializable<T>): void {
		const localMetadata = this.createLocalOpMetadata(op, previousValue);
		this.submitLocalMessage(op, localMetadata);
	}
}
