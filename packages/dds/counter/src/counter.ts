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
import {
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

import type { ISharedCounter, ISharedCounterEvents } from "./interfaces.js";

/**
 * Describes the operation (op) format for incrementing the {@link SharedCounter}.
 */
interface IIncrementOperation {
	type: "increment";
	incrementAmount: number;
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
 * @legacy
 * @alpha
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

		this.incrementCore(incrementAmount);
		this.submitLocalMessage(op);
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
	 * Process a counter operation (op).
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (message.type === MessageType.Operation && !local) {
			const op = message.contents as IIncrementOperation;

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

	/**
	 * {@inheritdoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
	 */
	protected applyStashedOp(op: unknown): void {
		const counterOp = op as IIncrementOperation;

		// TODO: Clean up error code linter violations repo-wide.

		assert(counterOp.type === "increment", 0x3ec /* Op type is not increment */);

		this.increment(counterOp.incrementAmount);
	}
}
