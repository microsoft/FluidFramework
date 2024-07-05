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
import {
	IFluidSerializer,
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

import {
	IConsensusRegisterCollection,
	IConsensusRegisterCollectionEvents,
	ReadPolicy,
} from "./interfaces.js";

interface ILocalData<T> {
	// Atomic version
	atomic: ILocalRegister<T>;

	// All concurrent versions awaiting consensus
	versions: ILocalRegister<T>[];
}

interface ILocalRegister<T> {
	// Register value, wrapped for backwards compatibility with < 0.17
	value: {
		type: "Plain";
		value: T;
	};

	// The sequence number when last consensus was reached
	sequenceNumber: number;
}

const newLocalRegister = <T>(sequenceNumber: number, value: T): ILocalRegister<T> => ({
	sequenceNumber,
	value: {
		type: "Plain",
		value,
	},
});

/**
 * An operation for consensus register collection
 *
 * The value stored in this op is serialized as a string and must be deserialized
 */
interface IRegisterOperationSerialized {
	key: string;
	type: "write";
	serializedValue: string;

	// Message can be delivered with delay - resubmitted on reconnect.
	// As such, refSeq needs to reference seq # at the time op was created,
	// not when op was actually sent over wire (ISequencedDocumentMessage.referenceSequenceNumber),
	// as client can ingest ops in between.
	refSeq: number | undefined;
}

/**
 * IRegisterOperation format in versions \< 0.17 and \>=2.0.0-rc.2.0.0
 *
 * The value stored in this op is _not_ serialized and is stored literally as `T`
 */
interface IRegisterOperationPlain<T> {
	key: string;
	type: "write";

	value: {
		type: "Plain";
		value: T;
	};

	// back-compat: for clients prior to 2.0.0-rc.2.0.0, we must also pass in
	// the serialized value for them to parse handles correctly. we do not have
	// to pay the cost of deserializing this value in newer clients
	serializedValue: string;

	// back-compat: files at rest written with runtime <= 0.13 do not have refSeq
	refSeq: number | undefined;
}

/** Incoming ops could match any of these types */
type IIncomingRegisterOperation<T> = IRegisterOperationSerialized | IRegisterOperationPlain<T>;

/** Distinguish between incoming op formats so we know which type it is */
const incomingOpMatchesPlainFormat = <T>(op): op is IRegisterOperationPlain<T> =>
	"value" in op;

/** The type of the resolve function to call after the local operation is ack'd */
type PendingResolve = (winner: boolean) => void;

const snapshotFileName = "header";

/**
 * {@inheritDoc IConsensusRegisterCollection}
 * @legacy
 * @alpha
 */
export class ConsensusRegisterCollection<T>
	extends SharedObject<IConsensusRegisterCollectionEvents>
	implements IConsensusRegisterCollection<T>
{
	private readonly data = new Map<string, ILocalData<T>>();

	/**
	 * Constructs a new consensus register collection. If the object is non-local an id and service interfaces will
	 * be provided
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_consensusRegisterCollection_");
	}

	/**
	 * Creates a new register or writes a new value.
	 * Returns a promise that will resolve when the write is acked.
	 *
	 * @returns Promise<true> if write was non-concurrent
	 */
	public async write(key: string, value: T): Promise<boolean> {
		if (!this.isAttached()) {
			this.processInboundWrite(key, value, 0, 0, true);
			return true;
		}

		const message: IRegisterOperationPlain<T> = {
			key,
			type: "write",
			serializedValue: this.stringify(value, this.serializer),
			value: {
				type: "Plain",
				value,
			},
			refSeq: this.deltaManager.lastSequenceNumber,
		};

		return this.newAckBasedPromise<boolean>((resolve) => {
			// Send the resolve function as the localOpMetadata. This will be provided back to us when the
			// op is ack'd.
			this.submitLocalMessage(message, resolve);
			// If we fail due to runtime being disposed, it's better to return false then unhandled exception.
		}).catch((error) => false);
	}

	/**
	 * Returns the most recent local value of a register.
	 * @param key - The key to read
	 * @param readPolicy - The ReadPolicy to apply. Defaults to Atomic.
	 */
	public read(key: string, readPolicy: ReadPolicy = ReadPolicy.Atomic): T | undefined {
		if (readPolicy === ReadPolicy.Atomic) {
			return this.readAtomic(key);
		}

		const versions = this.readVersions(key);

		if (versions !== undefined) {
			// We don't support deletion. So there should be at least one value.
			assert(versions.length > 0, 0x06c /* "Value should be undefined or non-empty" */);

			return versions[versions.length - 1];
		}
	}

	public readVersions(key: string): T[] | undefined {
		const data = this.data.get(key);
		return data?.versions.map((element: ILocalRegister<T>) => element.value.value);
	}

	public keys(): string[] {
		return [...this.data.keys()];
	}

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const dataObj: { [key: string]: ILocalData<T> } = {};
		this.data.forEach((v, k) => {
			dataObj[k] = v;
		});

		return createSingleBlobSummary(snapshotFileName, this.stringify(dataObj, serializer));
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const blob = await storage.readBlob(snapshotFileName);
		const header = bufferToString(blob, "utf8");
		const dataObj = this.parse(header, this.serializer);

		for (const key of Object.keys(dataObj)) {
			assert(
				dataObj[key].atomic?.value.type !== "Shared",
				0x06d /* "SharedObjects contained in ConsensusRegisterCollection can no longer be deserialized as of 0.17" */,
			);

			this.data.set(key, dataObj[key]);
		}
	}

	protected onDisconnect() {}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (message.type === MessageType.Operation) {
			const op = message.contents as IIncomingRegisterOperation<T>;
			switch (op.type) {
				case "write": {
					// backward compatibility: File at rest written with runtime <= 0.13 do not have refSeq
					// when the refSeq property didn't exist
					if (op.refSeq === undefined) {
						op.refSeq = message.referenceSequenceNumber;
					}
					// Message can be delivered with delay - e.g. resubmitted on reconnect.
					// Use the refSeq from when the op was created, not when it was transmitted
					const refSeqWhenCreated = op.refSeq;
					assert(
						refSeqWhenCreated <= message.referenceSequenceNumber,
						0x06e /* "Message's reference sequence number < op's reference sequence number!" */,
					);

					const value = incomingOpMatchesPlainFormat<T>(op)
						? op.value.value
						: (this.parse(op.serializedValue, this.serializer) as T);
					const winner = this.processInboundWrite(
						op.key,
						value,
						refSeqWhenCreated,
						message.sequenceNumber,
						local,
					);
					if (local) {
						// Resolve the pending promise for this operation now that we have received an ack for it.
						const resolve = localOpMetadata as PendingResolve;
						resolve(winner);
					}
					break;
				}
				default:
					unreachableCase(op.type);
			}
		}
	}

	private readAtomic(key: string): T | undefined {
		const data = this.data.get(key);
		return data?.atomic.value.value;
	}

	/**
	 * Process an inbound write op
	 * @param key - Key that was written to
	 * @param value - Incoming value
	 * @param refSeq - RefSeq at the time of write on the remote client
	 * @param sequenceNumber - Sequence Number of this write op
	 * @param local - Did this write originate on this client
	 */
	private processInboundWrite(
		key: string,
		value: T,
		refSeq: number,
		sequenceNumber: number,
		local: boolean,
	): boolean {
		let data = this.data.get(key);
		// Atomic update if it's a new register or the write was not concurrent,
		// meaning our state was known to the remote client at the time of write
		const winner = data === undefined || refSeq >= data.atomic.sequenceNumber;
		if (winner) {
			const atomicUpdate = newLocalRegister<T>(sequenceNumber, value);
			if (data === undefined) {
				data = {
					atomic: atomicUpdate,
					versions: [], // we'll update versions next, leave it empty for now
				};
				this.data.set(key, data);
			} else {
				data.atomic = atomicUpdate;
			}
		} else {
			assert(!!data, 0x06f /* "data missing for non-atomic inbound update!" */);
		}

		// Remove versions that were known to the remote client at the time of write
		while (data.versions.length > 0 && refSeq >= data.versions[0].sequenceNumber) {
			data.versions.shift();
		}

		const versionUpdate = newLocalRegister<T>(sequenceNumber, value);

		// Asserts for data integrity
		if (!this.isAttached()) {
			assert(
				refSeq === 0 && sequenceNumber === 0,
				0x070 /* "sequence numbers are expected to be 0 when unattached" */,
			);
		} else if (data.versions.length > 0) {
			assert(
				// seqNum should always be increasing, except for the case of grouped batches (seqNum will be the same)
				sequenceNumber >= data.versions[data.versions.length - 1].sequenceNumber,
				0x071 /* "Versions should naturally be ordered by sequenceNumber" */,
			);
		}

		// Push the new element.
		data.versions.push(versionUpdate);

		// Raise events at the end, to avoid reentrancy issues
		if (winner) {
			this.emit("atomicChanged", key, value, local);
		}
		this.emit("versionChanged", key, value, local);

		return winner;
	}

	private stringify(value: any, serializer: IFluidSerializer): string {
		return serializer.stringify(value, this.handle);
	}

	private parse(content: string, serializer: IFluidSerializer): any {
		return serializer.parse(content);
	}

	protected applyStashedOp(): void {
		// empty implementation
	}
}
