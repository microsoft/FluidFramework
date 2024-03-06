/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { type ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
	type IFluidDataStoreRuntime,
	type IChannelStorageService,
	type IChannelFactory,
	type IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { type ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import {
	createSingleBlobSummary,
	type IFluidSerializer,
	SharedObject,
} from "@fluidframework/shared-object-base";
import { CounterFactory } from "./counterFactory.js";
import { type ISharedCounter, type ISharedCounterEvents } from "./interfaces.js";

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
 * @alpha
 */
export class SharedCounter extends SharedObject<ISharedCounterEvents> implements ISharedCounter {
	/**
	 * Create a new {@link SharedCounter}.
	 *
	 * @param runtime - The data store runtime to which the new `SharedCounter` will belong.
	 * @param id - Optional name of the `SharedCounter`. If not provided, one will be generated.
	 *
	 * @returns newly create shared counter (but not attached yet)
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedCounter {
		return runtime.createChannel(id, CounterFactory.Type) as SharedCounter;
	}

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_counter_");
	}

	/**
	 * Get a factory for {@link SharedCounter} to register with the data store.
	 *
	 * @returns a factory that creates and load SharedCounter
	 */
	public static getFactory(): IChannelFactory {
		return new CounterFactory();
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

		// eslint-disable-next-line unicorn/numeric-separators-style
		assert(counterOp.type === "increment", 0x3ec /* Op type is not increment */);

		this.increment(counterOp.incrementAmount);
	}
}
