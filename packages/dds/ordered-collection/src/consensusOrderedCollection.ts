/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base/internal";
import { v4 as uuid } from "uuid";

import {
	ConsensusCallback,
	ConsensusResult,
	IConsensusOrderedCollection,
	IConsensusOrderedCollectionEvents,
	IOrderedCollection,
} from "./interfaces.js";

const snapshotFileNameData = "header";
const snapshotFileNameTracking = "jobTracking";

interface IConsensusOrderedCollectionValue<T> {
	// an ID used to indicate acquired item.
	// Used in acquire/release/complete ops.
	readonly acquireId: string;

	// The actual value
	readonly value: T;
}

/**
 * An operation for consensus ordered collection
 */
interface IConsensusOrderedCollectionAddOperation<T> {
	opName: "add";
	// serialized value
	value: string;
	deserializedValue?: T;
}

interface IConsensusOrderedCollectionAcquireOperation {
	opName: "acquire";
	// an ID used to indicate acquired item.
	// Used in acquire/release/complete ops.
	acquireId: string;
}

interface IConsensusOrderedCollectionCompleteOperation {
	opName: "complete";
	// an ID used to indicate acquired item.
	// Used in acquire/release/complete ops.
	acquireId: string;
}

interface IConsensusOrderedCollectionReleaseOperation {
	opName: "release";
	// an ID used to indicate acquired item.
	// Used in acquire/release/complete ops.
	acquireId: string;
}

type IConsensusOrderedCollectionOperation<T> =
	| IConsensusOrderedCollectionAddOperation<T>
	| IConsensusOrderedCollectionAcquireOperation
	| IConsensusOrderedCollectionCompleteOperation
	| IConsensusOrderedCollectionReleaseOperation;

/** The type of the resolve function to call after the local operation is ack'd */
type PendingResolve<T> = (value: IConsensusOrderedCollectionValue<T> | undefined) => void;

/**
 * For job tracking, we need to keep track of which client "owns" a given value.
 * Key is the acquireId from when it was acquired
 * Value is the acquired value, and the id of the client who acquired it, or undefined for unattached client
 */
type JobTrackingInfo<T> = Map<string, { value: T; clientId: string | undefined }>;
const idForLocalUnattachedClient = undefined;

/**
 * Implementation of a consensus collection shared object
 *
 * Implements the shared object's communication, and the semantics around the
 * release/complete mechanism following acquire.
 *
 * Generally not used directly. A derived type will pass in a backing data type
 * IOrderedCollection that will define the deterministic add/acquire order and snapshot ability.
 * @legacy
 * @alpha
 */
export class ConsensusOrderedCollection<T = any>
	extends SharedObject<IConsensusOrderedCollectionEvents<T>>
	implements IConsensusOrderedCollection<T>
{
	/**
	 * The set of values that have been acquired but not yet completed or released
	 */
	private jobTracking: JobTrackingInfo<T> = new Map();

	/**
	 * Constructs a new consensus collection. If the object is non-local an id and service interfaces will
	 * be provided
	 */
	protected constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		private readonly data: IOrderedCollection<T>,
	) {
		super(id, runtime, attributes, "fluid_consensusOrderedCollection_");

		// We can't simply call this.removeClient(this.runtime.clientId) in on runtime disconnected,
		// because other clients may disconnect concurrently.
		// Disconnect order matters because it defines the order items go back to the queue.
		// So we put items back to queue only when we process our own removeMember event.
		runtime.getQuorum().on("removeMember", (clientId: string) => {
			assert(!!clientId, 0x067 /* "Missing clientId for removal!" */);
			this.removeClient(clientId);
		});
	}

	/**
	 * Add a value to the consensus collection.
	 */
	public async add(value: T): Promise<void> {
		const valueSer = this.serializeValue(value, this.serializer);

		if (!this.isAttached()) {
			// For the case where this is not attached yet, explicitly JSON
			// clone the value to match the behavior of going thru the wire.
			const addValue = this.deserializeValue(valueSer, this.serializer) as T;
			this.addCore(addValue);
			return;
		}

		await this.submit<IConsensusOrderedCollectionAddOperation<T>>({
			opName: "add",
			value: valueSer,
			deserializedValue: value,
		});
	}

	/**
	 * Remove a value from the consensus collection.  If the collection is empty, returns false.
	 * Otherwise calls callback with the value
	 */
	public async acquire(callback: ConsensusCallback<T>): Promise<boolean> {
		const result = await this.acquireInternal();
		if (result === undefined) {
			return false;
		}

		const res = await callback(result.value);

		switch (res) {
			case ConsensusResult.Complete:
				await this.complete(result.acquireId);
				break;
			case ConsensusResult.Release:
				this.release(result.acquireId);
				this.emit("localRelease", result.value, true /* intentional */);
				break;
			default:
				unreachableCase(res);
		}

		return true;
	}

	/**
	 * Wait for a value to be available and acquire it from the consensus collection
	 */
	public async waitAndAcquire(callback: ConsensusCallback<T>): Promise<void> {
		do {
			if (this.data.size() === 0) {
				// Wait for new entry before trying to acquire again
				await this.newAckBasedPromise<T>((resolve) => {
					this.once("add", resolve);
				});
			}
		} while (!(await this.acquire(callback)));
	}

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		// If we are transitioning from unattached to attached mode,
		// then we are losing all checked out work!
		this.removeClient(idForLocalUnattachedClient);

		const builder = new SummaryTreeBuilder();
		let blobContent = this.serializeValue(this.data.asArray(), serializer);
		builder.addBlob(snapshotFileNameData, blobContent);
		blobContent = this.serializeValue(Array.from(this.jobTracking.entries()), serializer);
		builder.addBlob(snapshotFileNameTracking, blobContent);
		return builder.getSummaryTree();
	}

	protected isActive() {
		return this.runtime.connected && this.deltaManager.active;
	}

	protected async complete(acquireId: string) {
		if (!this.isAttached()) {
			this.completeCore(acquireId);
			return;
		}

		// if not active, this item already was released to queue (as observed by other clients)
		if (this.isActive()) {
			await this.submit<IConsensusOrderedCollectionCompleteOperation>({
				opName: "complete",
				acquireId,
			});
		}
	}

	protected completeCore(acquireId: string) {
		// Note: item may be no longer in jobTracking and returned back to queue!
		const rec = this.jobTracking.get(acquireId);
		if (rec !== undefined) {
			this.jobTracking.delete(acquireId);
			this.emit("complete", rec.value);
		}
	}

	protected release(acquireId: string) {
		if (!this.isAttached()) {
			this.releaseCore(acquireId);
			return;
		}

		// if not active, this item already was released to queue (as observed by other clients)
		if (this.isActive()) {
			this.submit<IConsensusOrderedCollectionReleaseOperation>({
				opName: "release",
				acquireId,
			}).catch((error) => {
				this.logger.sendErrorEvent({ eventName: "ConsensusQueue_release" }, error);
			});
		}
	}

	protected releaseCore(acquireId: string) {
		// Note: item may be no longer in jobTracking and returned back to queue!
		const rec = this.jobTracking.get(acquireId);
		if (rec !== undefined) {
			this.jobTracking.delete(acquireId);
			this.data.add(rec.value);
			this.emit("add", rec.value, false /* newlyAdded */);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		assert(
			this.jobTracking.size === 0,
			0x068 /* "On consensusOrderedCollection load, job tracking size > 0" */,
		);
		const blob = await storage.readBlob(snapshotFileNameTracking);
		const rawContentTracking = bufferToString(blob, "utf8");
		const content = this.deserializeValue(rawContentTracking, this.serializer);
		this.jobTracking = new Map(
			content as Iterable<readonly [string, { value: T; clientId: string | undefined }]>,
		);

		assert(
			this.data.size() === 0,
			0x069 /* "On consensusOrderedCollection load, data size > 0" */,
		);
		const blob2 = await storage.readBlob(snapshotFileNameData);
		const rawContentData = bufferToString(blob2, "utf8");
		const content2 = this.deserializeValue(rawContentData, this.serializer) as T[];
		this.data.loadFrom(content2);
	}

	protected onDisconnect() {
		for (const [, { value, clientId }] of this.jobTracking) {
			if (clientId === this.runtime.clientId) {
				this.emit("localRelease", value, false /* intentional */);
			}
		}
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (message.type === MessageType.Operation) {
			const op = message.contents as IConsensusOrderedCollectionOperation<T>;
			let value: IConsensusOrderedCollectionValue<T> | undefined;
			switch (op.opName) {
				case "add":
					if (op.deserializedValue !== undefined) {
						this.addCore(op.deserializedValue);
					} else {
						this.addCore(this.deserializeValue(op.value, this.serializer) as T);
					}
					break;

				case "acquire":
					value = this.acquireCore(op.acquireId, message.clientId ?? undefined);
					break;

				case "complete":
					this.completeCore(op.acquireId);
					break;

				case "release":
					this.releaseCore(op.acquireId);
					break;

				default:
					unreachableCase(op);
			}
			if (local) {
				// Resolve the pending promise for this operation now that we have received an ack for it.
				const resolve = localOpMetadata as PendingResolve<T>;
				resolve(value);
			}
		}
	}

	private async submit<TMessage extends IConsensusOrderedCollectionOperation<T>>(
		message: TMessage,
	): Promise<IConsensusOrderedCollectionValue<T> | undefined> {
		assert(this.isAttached(), 0x06a /* "Trying to submit message while detached!" */);

		return this.newAckBasedPromise<IConsensusOrderedCollectionValue<T> | undefined>(
			(resolve) => {
				// Send the resolve function as the localOpMetadata. This will be provided back to us when the
				// op is ack'd.
				this.submitLocalMessage(message, resolve);
				// If we fail due to runtime being disposed, it's better to return undefined then unhandled exception.
			},
		).catch((error) => undefined);
	}

	private addCore(value: T) {
		this.data.add(value);
		this.emit("add", value, true /* newlyAdded */);
	}

	private acquireCore(
		acquireId: string,
		clientId?: string,
	): IConsensusOrderedCollectionValue<T> | undefined {
		if (this.data.size() === 0) {
			return undefined;
		}
		const value = this.data.remove();

		const value2: IConsensusOrderedCollectionValue<T> = {
			acquireId,
			value,
		};
		this.jobTracking.set(value2.acquireId, { value, clientId });

		this.emit("acquire", value, clientId);
		return value2;
	}

	private async acquireInternal(): Promise<IConsensusOrderedCollectionValue<T> | undefined> {
		if (!this.isAttached()) {
			// can be undefined if queue is empty
			return this.acquireCore(uuid(), idForLocalUnattachedClient);
		}

		return this.submit<IConsensusOrderedCollectionAcquireOperation>({
			opName: "acquire",
			acquireId: uuid(),
		});
	}

	private removeClient(clientIdToRemove?: string) {
		const added: T[] = [];
		for (const [acquireId, { value, clientId }] of this.jobTracking) {
			if (clientId === clientIdToRemove) {
				this.jobTracking.delete(acquireId);
				this.data.add(value);
				added.push(value);
			}
		}

		// Raise all events only after all state changes are completed,
		// to guarantee same ordering of operations if collection is manipulated from events.
		added.map((value) => this.emit("add", value, false /* newlyAdded */));
	}

	private serializeValue(value, serializer: IFluidSerializer) {
		return serializer.stringify(value, this.handle);
	}

	private deserializeValue(content: string, serializer: IFluidSerializer) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return serializer.parse(content);
	}

	protected applyStashedOp(): void {
		throw new Error("not implemented");
	}
}
