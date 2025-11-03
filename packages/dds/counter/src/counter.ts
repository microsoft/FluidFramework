/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type {
	ISummaryTreeWithStats,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
	ISequencedMessageEnvelope,
} from "@fluidframework/runtime-definitions/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

import type { ISharedCounter, ISharedCounterEvents } from "./interfaces.js";

/**
 * Describes the operation (op) format for incrementing the {@link SharedCounter}.
 */
export interface IIncrementOperation {
	type: "increment";
	incrementAmount: number;
}

/**
 * Represents a pending op that has been submitted but not yet ack'd.
 * Includes the messageId that was used when submitting the op.
 */
interface IPendingOperation {
	type: "increment";
	incrementAmount: number;
	messageId: number;
}

/**
 * @remarks Used in snapshotting.
 */
interface ICounterSnapshotFormat {
	/**
	 * The value of the counter.
	 */
	value: number;
}

const snapshotFileName = "header";

/**
 * {@inheritDoc ISharedCounter}
 * @legacy @beta
 */
export class SharedCounter
	extends SharedObject<ISharedCounterEvents>
	implements ISharedCounter
{
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_counter_");
	}

	private _value: number = 0;

	/**
	 * Tracks pending local ops that have not been ack'd yet.
	 */
	private readonly pendingOps: IPendingOperation[] = [];

	/**
	 * The next message id to be used when submitting an op.
	 */
	private nextPendingMessageId: number = 0;

	/**
	 * {@inheritDoc ISharedCounter.value}
	 */
	public get value(): number {
		return this._value;
	}

	/**
	 * {@inheritDoc ISharedCounter.increment}
	 */
	public increment(incrementAmount: number): void {
		// Incrementing by floating point numbers will be eventually inconsistent, since the order in which the
		// increments are applied affects the result.  A more-robust solution would be required to support this.
		if (incrementAmount % 1 !== 0) {
			throw new Error("Must increment by a whole number");
		}

		const op: IIncrementOperation = {
			type: "increment",
			incrementAmount,
		};
		const messageId = this.nextPendingMessageId++;

		this.incrementCore(incrementAmount);
		// We don't need to send the op if we are not attached yet.
		if (this.isAttached()) {
			this.pendingOps.push({ ...op, messageId });
			this.submitLocalMessage(op, messageId);
		}
	}

	private incrementCore(incrementAmount: number): void {
		this._value += incrementAmount;
		this.emit("incremented", incrementAmount, this._value);
	}

	/**
	 * Create a summary for the counter.
	 *
	 * @returns The summary of the current state of the counter.
	 */
	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		// Get a serializable form of data
		const content: ICounterSnapshotFormat = {
			value: this.value,
		};

		// And then construct the summary for it
		return createSingleBlobSummary(snapshotFileName, JSON.stringify(content));
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<ICounterSnapshotFormat>(storage, snapshotFileName);

		this._value = content.value;
	}

	/**
	 * Called when the object has disconnected from the delta stream.
	 */
	protected onDisconnect(): void {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processMessagesCore}
	 */
	protected processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		const { envelope, local, messagesContent } = messagesCollection;
		for (const messageContent of messagesContent) {
			this.processMessage(envelope, messageContent, local);
		}
	}

	private processMessage(
		messageEnvelope: ISequencedMessageEnvelope,
		messageContent: IRuntimeMessagesContent,
		local: boolean,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (messageEnvelope.type === MessageType.Operation) {
			const op = messageContent.contents as IIncrementOperation;

			// If the message is local we have already optimistically processed
			// and we should now remove it from this.pendingOps.
			// If the message is from a remote client, we should process it.
			if (local) {
				const pendingOp = this.pendingOps.shift();
				const messageId = messageContent.localOpMetadata;
				assert(typeof messageId === "number", "localOpMetadata should be a number");
				assert(
					pendingOp !== undefined &&
						pendingOp.messageId === messageId &&
						pendingOp.type === op.type &&
						pendingOp.incrementAmount === op.incrementAmount,
					"local op mismatch",
				);
			} else {
				switch (op.type) {
					case "increment": {
						this.incrementCore(op.incrementAmount);
						break;
					}

					default: {
						throw new Error("Unknown operation");
					}
				}
			}
		}
	}

	/**
	 * {@inheritdoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
	 */
	protected applyStashedOp(op: unknown): void {
		const counterOp = op as IIncrementOperation;

		// TODO: Clean up error code linter violations repo-wide.

		assert(counterOp.type === "increment", 0x3ec /* Op type is not increment */);

		this.increment(counterOp.incrementAmount);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.rollback}
	 * @sealed
	 */
	protected rollback(content: unknown, localOpMetadata: unknown): void {
		assertIsIncrementOp(content);
		assert(typeof localOpMetadata === "number", "localOpMetadata should be a number");
		const pendingOp = this.pendingOps.pop();
		assert(
			pendingOp !== undefined &&
				pendingOp.messageId === localOpMetadata &&
				pendingOp.type === content.type &&
				pendingOp.incrementAmount === content.incrementAmount,
			"op to rollback mismatch with pending op",
		);
		// To rollback the optimistic increment we can increment by the opposite amount.
		// This will also emit another incremented event with the opposite amount.
		this.incrementCore(-content.incrementAmount);
	}
}

function assertIsIncrementOp(op: unknown): asserts op is IIncrementOperation {
	assert(
		typeof op === "object" &&
			op !== null &&
			"type" in op &&
			"incrementAmount" in op &&
			op.type === "increment" &&
			typeof op.incrementAmount === "number",
		"invalid increment op format",
	);
}
