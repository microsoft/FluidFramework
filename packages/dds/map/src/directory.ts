/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
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
import { RedBlackTree } from "@fluidframework/merge-tree/internal";
import type {
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	SharedObject,
	ValueType,
	bindHandles,
	parseHandles,
} from "@fluidframework/shared-object-base/internal";
import {
	type ITelemetryLoggerExt,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";
import path from "path-browserify";

import type {
	IDirectory,
	IDirectoryEvents,
	IDirectoryValueChanged,
	ISharedDirectory,
	ISharedDirectoryEvents,
	IValueChanged,
} from "./interfaces.js";
import type {
	// eslint-disable-next-line import/no-deprecated
	ISerializableValue,
	ISerializedValue,
} from "./internalInterfaces.js";
import { serializeValue, migrateIfSharedSerializable } from "./localValues.js";

// We use path-browserify since this code can run safely on the server or the browser.
// We standardize on using posix slashes everywhere.
const posix = path.posix;

const snapshotFileName = "header";

/**
 * Defines the means to process and submit a given op on a directory.
 */
interface IDirectoryMessageHandler {
	/**
	 * Apply the given operation.
	 * @param msg - The message from the server to apply.
	 * @param op - The directory operation to apply
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	process(
		msg: ISequencedDocumentMessage,
		op: IDirectoryOperation,
		local: boolean,
		localOpMetadata: unknown,
	): void;

	/**
	 * Communicate the operation to remote clients.
	 * @param op - The directory operation to submit
	 * @param localOpMetadata - The metadata to be submitted with the message.
	 */
	submit(op: IDirectoryOperation, localOpMetadata: unknown): void;
}

/**
 * Operation indicating a value should be set for a key.
 */
export interface IDirectorySetOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "set";

	/**
	 * Directory key being modified.
	 */
	key: string;

	/**
	 * Absolute path of the directory where the modified key is located.
	 */
	path: string;

	/**
	 * Value to be set on the key.
	 */
	// eslint-disable-next-line import/no-deprecated
	value: ISerializableValue;
}

/**
 * Operation indicating a key should be deleted from the directory.
 */
export interface IDirectoryDeleteOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "delete";

	/**
	 * Directory key being modified.
	 */
	key: string;

	/**
	 * Absolute path of the directory where the modified key is located.
	 */
	path: string;
}

/**
 * An operation on a specific key within a directory.
 */
export type IDirectoryKeyOperation = IDirectorySetOperation | IDirectoryDeleteOperation;

/**
 * Operation indicating the directory should be cleared.
 */
export interface IDirectoryClearOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "clear";

	/**
	 * Absolute path of the directory being cleared.
	 */
	path: string;
}

/**
 * An operation on one or more of the keys within a directory.
 */
export type IDirectoryStorageOperation = IDirectoryKeyOperation | IDirectoryClearOperation;

/**
 * Operation indicating a subdirectory should be created.
 */
export interface IDirectoryCreateSubDirectoryOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "createSubDirectory";

	/**
	 * Absolute path of the directory that will contain the new subdirectory.
	 */
	path: string;

	/**
	 * Name of the new subdirectory.
	 */
	subdirName: string;
}

/**
 * Operation indicating a subdirectory should be deleted.
 */
export interface IDirectoryDeleteSubDirectoryOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "deleteSubDirectory";

	/**
	 * Absolute path of the directory that contains the directory to be deleted.
	 */
	path: string;

	/**
	 * Name of the subdirectory to be deleted.
	 */
	subdirName: string;
}

/**
 * An operation on the subdirectories within a directory.
 */
export type IDirectorySubDirectoryOperation =
	| IDirectoryCreateSubDirectoryOperation
	| IDirectoryDeleteSubDirectoryOperation;

/**
 * Any operation on a directory.
 */
export type IDirectoryOperation = IDirectoryStorageOperation | IDirectorySubDirectoryOperation;

interface PendingKeySet {
	type: "set";
	path: string;
	// eslint-disable-next-line import/no-deprecated
	value: ISerializableValue;
}

interface PendingKeyDelete {
	type: "delete";
	path: string;
	key: string;
}

interface PendingClear {
	type: "clear";
	path: string;
}

interface PendingKeyLifetime {
	type: "lifetime";
	key: string;
	path: string;
	/**
	 * A non-empty array of pending key sets that occurred during this lifetime.  If the list
	 * becomes empty (e.g. during processing or rollback), the lifetime no longer exists and
	 * must be removed from the pending data.
	 */
	keySets: PendingKeySet[];
}

/**
 * A member of the pendingStorageData array, which tracks outstanding changes and can be used to
 * compute optimistic values. Local sets are aggregated into lifetimes.
 */
type PendingStorageEntry = PendingKeyLifetime | PendingKeyDelete | PendingClear;

interface PendingSubDirectoryCreate {
	type: "createSubDirectory";
	path: string;
	subdirName: string;
	subdir: SubDirectory;
}

interface PendingSubDirectoryDelete {
	type: "deleteSubDirectory";
	path: string;
	subdirName: string;
}

type PendingSubDirectoryEntry = PendingSubDirectoryCreate | PendingSubDirectoryDelete;

/**
 * Rough polyfill for Array.findLastIndex until we target ES2023 or greater.
 */
const findLastIndex = <T>(array: T[], callbackFn: (value: T) => boolean): number => {
	for (let i = array.length - 1; i >= 0; i--) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (callbackFn(array[i]!)) {
			return i;
		}
	}
	return -1;
};

/**
 * Rough polyfill for Array.findLast until we target ES2023 or greater.
 */
const findLast = <T>(array: T[], callbackFn: (value: T) => boolean): T | undefined =>
	array[findLastIndex(array, callbackFn)];

/**
 * Create info for the subdirectory.
 *
 * @deprecated - This interface will no longer be exported in the future(AB#8004).
 *
 * @legacy
 * @alpha
 */
export interface ICreateInfo {
	/**
	 * Sequence number at which this subdirectory was created.
	 */
	csn: number;

	/**
	 * clientids of the clients which created this sub directory.
	 */
	ccIds: string[];
}

/**
 * Defines the in-memory object structure to be used for the conversion to/from serialized.
 *
 * @remarks Directly used in
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
 * | JSON.stringify}, direct result from
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 *
 * @deprecated - This interface will no longer be exported in the future(AB#8004).
 *
 * @legacy
 * @alpha
 */
export interface IDirectoryDataObject {
	/**
	 * Key/value date set by the user.
	 */
	// eslint-disable-next-line import/no-deprecated
	storage?: Record<string, ISerializableValue>;

	/**
	 * Recursive sub-directories {@link IDirectoryDataObject | objects}.
	 */
	subdirectories?: Record<string, IDirectoryDataObject>;

	/**
	 * Create info for the sub directory. Since directories with same name can get deleted/created by multiple clients
	 * asynchronously, this info helps us to determine whether the ops where for the current instance of sub directory
	 * or not and whether to process them or not based on that. Summaries which were not produced which this change
	 * will not have this info and in that case we can still run in eventual consistency issues but that is no worse
	 * than the state before this change.
	 */
	ci?: ICreateInfo;
}

/**
 * {@link IDirectory} storage format.
 *
 * @deprecated - This interface will no longer be exported in the future(AB#8004).
 *
 * @legacy
 * @alpha
 */
export interface IDirectoryNewStorageFormat {
	/**
	 * Blob IDs representing larger directory data that was serialized.
	 */
	blobs: string[];

	/**
	 * Storage content representing directory data that was not serialized.
	 */
	content: IDirectoryDataObject;
}

/**
 * The comparator essentially performs the following procedure to determine the order of subdirectory creation:
 * 1. If subdirectory A has a non-negative 'seq' and subdirectory B has a negative 'seq', subdirectory A is always placed first due to
 * the policy that acknowledged subdirectories precede locally created ones that have not been committed yet.
 *
 * 2. When both subdirectories A and B have a non-negative 'seq', they are compared as follows:
 * - If A and B have different 'seq', they are ordered based on 'seq', and the one with the lower 'seq' will be positioned ahead. Notably this rule
 * should not be applied in the directory ordering, since the lowest 'seq' is -1, when the directory is created locally but not acknowledged yet.
 * - In the case where A and B have equal 'seq', the one with the lower 'clientSeq' will be positioned ahead. This scenario occurs when grouped
 * batching is enabled, and a lower 'clientSeq' indicates that it was processed earlier after the batch was ungrouped.
 *
 * 3. When both subdirectories A and B have a negative 'seq', they are compared as follows:
 * - If A and B have different 'seq', the one with lower 'seq' will be positioned ahead, which indicates the corresponding creation message was
 * acknowledged by the server earlier.
 * - If A and B have equal 'seq', the one with lower 'clientSeq' will be placed at the front. This scenario suggests that both subdirectories A
 * and B were created locally and not acknowledged yet, with the one possessing the lower 'clientSeq' being created earlier.
 *
 * 4. A 'seq' value of zero indicates that the subdirectory was created in detached state, and it is considered acknowledged for the
 * purpose of ordering.
 */
const seqDataComparator = (a: SequenceData, b: SequenceData): number => {
	if (isAcknowledgedOrDetached(a)) {
		if (isAcknowledgedOrDetached(b)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return a.seq === b.seq ? a.clientSeq! - b.clientSeq! : a.seq - b.seq;
		} else {
			return -1;
		}
	} else {
		if (isAcknowledgedOrDetached(b)) {
			return 1;
		} else {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return a.seq === b.seq ? a.clientSeq! - b.clientSeq! : a.seq - b.seq;
		}
	}
};

function isAcknowledgedOrDetached(seqData: SequenceData): boolean {
	return seqData.seq >= 0;
}

/**
 * The combination of sequence numebr and client sequence number of a subdirectory
 */
interface SequenceData {
	seq: number;
	clientSeq?: number;
}

/**
 * A utility class for tracking associations between keys and their creation indices.
 * This is relevant to support map iteration in insertion order, see
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator/%40%40iterator
 *
 * TODO: It can be combined with the creation tracker utilized in SharedMap
 */
class DirectoryCreationTracker {
	public readonly indexToKey: RedBlackTree<SequenceData, string>;

	public readonly keyToIndex: Map<string, SequenceData>;

	public constructor() {
		this.indexToKey = new RedBlackTree<SequenceData, string>(seqDataComparator);
		this.keyToIndex = new Map<string, SequenceData>();
	}

	public set(key: string, seqData: SequenceData): void {
		this.indexToKey.put(seqData, key);
		this.keyToIndex.set(key, seqData);
	}

	public has(keyOrSeqData: string | SequenceData): boolean {
		return typeof keyOrSeqData === "string"
			? this.keyToIndex.has(keyOrSeqData)
			: this.indexToKey.get(keyOrSeqData) !== undefined;
	}

	public delete(keyOrSeqData: string | SequenceData): void {
		if (this.has(keyOrSeqData)) {
			if (typeof keyOrSeqData === "string") {
				const seqData = this.keyToIndex.get(keyOrSeqData) as SequenceData;
				this.keyToIndex.delete(keyOrSeqData);
				this.indexToKey.remove(seqData);
			} else {
				const key = this.indexToKey.get(keyOrSeqData)?.data as string;
				this.indexToKey.remove(keyOrSeqData);
				this.keyToIndex.delete(key);
			}
		}
	}

	/**
	 * Retrieves all subdirectories with creation order that satisfy an optional constraint function.
	 * @param constraint - An optional constraint function that filters keys.
	 * @returns An array of keys that satisfy the constraint (or all keys if no constraint is provided).
	 */
	public keys(constraint?: (key: string) => boolean): string[] {
		const keys: string[] = [];
		this.indexToKey.mapRange((node) => {
			if (!constraint || constraint(node.data)) {
				keys.push(node.data);
			}
			return true;
		}, keys);
		return keys;
	}

	public get size(): number {
		return this.keyToIndex.size;
	}
}

/**
 * {@inheritDoc ISharedDirectory}
 *
 * @example
 *
 * ```typescript
 * mySharedDirectory.createSubDirectory("a").createSubDirectory("b").createSubDirectory("c").set("foo", val1);
 * const mySubDir = mySharedDirectory.getWorkingDirectory("/a/b/c");
 * mySubDir.get("foo"); // returns val1
 * ```
 *
 * @sealed
 */
export class SharedDirectory
	extends SharedObject<ISharedDirectoryEvents>
	implements ISharedDirectory
{
	/**
	 * String representation for the class.
	 */
	public [Symbol.toStringTag]: string = "SharedDirectory";

	/**
	 * {@inheritDoc IDirectory.absolutePath}
	 */
	public get absolutePath(): string {
		return this.root.absolutePath;
	}

	/**
	 * Root of the SharedDirectory, most operations on the SharedDirectory itself act on the root.
	 */
	private readonly root: SubDirectory = new SubDirectory(
		{ seq: 0, clientSeq: 0 },
		new Set(),
		this,
		this.runtime,
		this.serializer,
		posix.sep,
		this.logger,
	);

	/**
	 * Mapping of op types to message handlers.
	 */
	private readonly messageHandlers = new Map<string, IDirectoryMessageHandler>();

	/**
	 * Constructs a new shared directory. If the object is non-local an id and service interfaces will
	 * be provided.
	 * @param id - String identifier for the SharedDirectory
	 * @param runtime - Data store runtime
	 * @param type - Type identifier
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_directory_");
		this.setMessageHandlers();
		// Mirror the containedValueChanged op on the SharedDirectory
		this.root.on("containedValueChanged", (changed: IValueChanged, local: boolean) => {
			this.emit("containedValueChanged", changed, local, this);
		});
		this.root.on("subDirectoryCreated", (relativePath: string, local: boolean) => {
			this.emit("subDirectoryCreated", relativePath, local, this);
		});
		this.root.on("subDirectoryDeleted", (relativePath: string, local: boolean) => {
			this.emit("subDirectoryDeleted", relativePath, local, this);
		});
	}

	/**
	 * {@inheritDoc IDirectory.get}
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public get<T = any>(key: string): T | undefined {
		return this.root.get<T>(key);
	}

	/**
	 * {@inheritDoc IDirectory.set}
	 */
	public set<T = unknown>(key: string, value: T): this {
		this.root.set(key, value);
		return this;
	}

	public dispose(error?: Error): void {
		this.root.dispose(error);
	}

	public get disposed(): boolean {
		return this.root.disposed;
	}

	/**
	 * Deletes the given key from within this IDirectory.
	 * @param key - The key to delete
	 * @returns True if the key existed and was deleted, false if it did not exist
	 */
	public delete(key: string): boolean {
		return this.root.delete(key);
	}

	/**
	 * Deletes all keys from within this IDirectory.
	 */
	public clear(): void {
		this.root.clear();
	}

	/**
	 * Checks whether the given key exists in this IDirectory.
	 * @param key - The key to check
	 * @returns True if the key exists, false otherwise
	 */
	public has(key: string): boolean {
		return this.root.has(key);
	}

	/**
	 * The number of entries under this IDirectory.
	 */
	public get size(): number {
		return this.root.size;
	}

	/**
	 * Issue a callback on each entry under this IDirectory.
	 * @param callback - Callback to issue
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public forEach(callback: (value: any, key: string, map: Map<string, any>) => void): void {
		// eslint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-callback-reference
		this.root.forEach(callback);
	}

	/**
	 * Get an iterator over the entries under this IDirectory.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public [Symbol.iterator](): IterableIterator<[string, any]> {
		return this.root[Symbol.iterator]();
	}

	/**
	 * Get an iterator over the entries under this IDirectory.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public entries(): IterableIterator<[string, any]> {
		return this.root.entries();
	}

	/**
	 * {@inheritDoc IDirectory.countSubDirectory}
	 */
	public countSubDirectory(): number {
		return this.root.countSubDirectory();
	}

	/**
	 * Get an iterator over the keys under this IDirectory.
	 * @returns The iterator
	 */
	public keys(): IterableIterator<string> {
		return this.root.keys();
	}

	/**
	 * Get an iterator over the values under this IDirectory.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public values(): IterableIterator<any> {
		return this.root.values();
	}

	/**
	 * {@inheritDoc IDirectory.createSubDirectory}
	 */
	public createSubDirectory(subdirName: string): IDirectory {
		return this.root.createSubDirectory(subdirName);
	}

	/**
	 * {@inheritDoc IDirectory.getSubDirectory}
	 */
	public getSubDirectory(subdirName: string): IDirectory | undefined {
		return this.root.getSubDirectory(subdirName);
	}

	/**
	 * {@inheritDoc IDirectory.hasSubDirectory}
	 */
	public hasSubDirectory(subdirName: string): boolean {
		return this.root.hasSubDirectory(subdirName);
	}

	/**
	 * {@inheritDoc IDirectory.deleteSubDirectory}
	 */
	public deleteSubDirectory(subdirName: string): boolean {
		return this.root.deleteSubDirectory(subdirName);
	}

	/**
	 * {@inheritDoc IDirectory.subdirectories}
	 */
	public subdirectories(): IterableIterator<[string, IDirectory]> {
		return this.root.subdirectories();
	}

	/**
	 * {@inheritDoc IDirectory.getWorkingDirectory}
	 */
	public getWorkingDirectory(relativePath: string): IDirectory | undefined {
		const absolutePath = this.makeAbsolute(relativePath);
		if (absolutePath === posix.sep) {
			return this.root;
		}

		let currentSubDir = this.root;
		const subdirs = absolutePath.slice(1).split(posix.sep);
		for (const subdir of subdirs) {
			currentSubDir = currentSubDir.getSubDirectory(subdir) as SubDirectory;
			if (!currentSubDir) {
				return undefined;
			}
		}
		return currentSubDir;
	}

	private getWorkingDirectoryEvenIfPendingDelete(
		relativePath: string,
	): IDirectory | undefined {
		const absolutePath = this.makeAbsolute(relativePath);
		if (absolutePath === posix.sep) {
			return this.root;
		}

		let currentSubDir = this.root;
		const subdirs = absolutePath.slice(1).split(posix.sep);
		for (const subdir of subdirs) {
			currentSubDir = currentSubDir.getSubDirectoryEvenIfPendingDelete(subdir) as SubDirectory;
			if (!currentSubDir) {
				return undefined;
			}
		}
		return currentSubDir;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.summarizeCore}
	 */
	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		return this.serializeDirectory(this.root, serializer);
	}

	/**
	 * Submits an operation
	 * @param op - Op to submit
	 * @param localOpMetadata - The local metadata associated with the op. We send a unique id that is used to track
	 * this op while it has not been ack'd. This will be sent when we receive this op back from the server.
	 */
	public submitDirectoryMessage(op: IDirectoryOperation, localOpMetadata: unknown): void {
		this.submitLocalMessage(op, localOpMetadata);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
	 */
	protected onDisconnect(): void {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.reSubmitCore}
	 */
	protected override reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		const message = content as IDirectoryOperation;
		const handler = this.messageHandlers.get(message.type);
		assert(handler !== undefined, 0x00d /* Missing message handler for message type */);
		handler.submit(message, localOpMetadata);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const data = await readAndParse(storage, snapshotFileName);
		const newFormat = data as IDirectoryNewStorageFormat;
		if (Array.isArray(newFormat.blobs)) {
			// New storage format
			this.populate(newFormat.content);
			const blobContents = await Promise.all(
				newFormat.blobs.map(async (blobName) => readAndParse(storage, blobName)),
			);
			for (const blobContent of blobContents) {
				this.populate(blobContent as IDirectoryDataObject);
			}
		} else {
			// Old storage format
			this.populate(data as IDirectoryDataObject);
		}
	}

	/**
	 * Populate the directory with the given directory data.
	 * @param data - A JSON string containing serialized directory data
	 */
	protected populate(data: IDirectoryDataObject): void {
		const stack: [SubDirectory, IDirectoryDataObject][] = [];
		stack.push([this.root, data]);

		while (stack.length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const [currentSubDir, currentSubDirObject] = stack.pop()!;
			if (currentSubDirObject.subdirectories) {
				// Utilize a map to store the seq -> clientSeq for the newly created subdirectory
				const tempSeqNums = new Map<number, number>();

				// Sort subdirectories by their sequence number to maintain proper iteration order
				// TODO: can probably just use iterator
				const subdirEntries = Object.entries(currentSubDirObject.subdirectories);
				subdirEntries.sort(([, a], [, b]) => {
					const aSeq = a.ci?.csn ?? 0;
					const bSeq = b.ci?.csn ?? 0;
					if (aSeq !== bSeq) {
						return aSeq - bSeq;
					}
					// If sequence numbers are equal, sort by client sequence if available (ccsn)
					const aCi = a.ci as { csn: number; ccIds: string[]; ccsn?: number };
					const bCi = b.ci as { csn: number; ccIds: string[]; ccsn?: number };
					const aClientSeq = aCi?.ccsn ?? 0;
					const bClientSeq = bCi?.ccsn ?? 0;
					return aClientSeq - bClientSeq;
				});

				for (const [subdirName, subdirObject] of subdirEntries) {
					let newSubDir = currentSubDir.getSubDirectory(subdirName) as SubDirectory;
					let seqData: SequenceData;
					if (!newSubDir) {
						const createInfo = subdirObject.ci;
						// We do not store the client sequence number in the storage because the order has already been
						// guaranteed during the serialization process. As a result, it is only essential to utilize the
						// "fake" client sequence number to signify the loading order, and there is no need to retain
						// the actual client sequence number at this point.
						if (createInfo !== undefined && createInfo.csn > 0) {
							if (!tempSeqNums.has(createInfo.csn)) {
								tempSeqNums.set(createInfo.csn, 0);
							}
							let fakeClientSeq = tempSeqNums.get(createInfo.csn) as number;
							seqData = { seq: createInfo.csn, clientSeq: fakeClientSeq };
							tempSeqNums.set(createInfo.csn, ++fakeClientSeq);
						} else {
							/**
							 * 1. If csn is -1, then initialize it with 0, otherwise we will never process ops for this
							 * sub directory. This could be done at serialization time too, but we need to maintain
							 * back compat too and also we will actually know the state when it was serialized.
							 * 2. We need to make the csn = -1 and csn = 0 share the same counter, there are cases
							 * where both -1 and 0 coexist within a single document.
							 */
							seqData = {
								seq: 0,
								clientSeq: ++currentSubDir.localCreationSeq,
							};
						}
						newSubDir = new SubDirectory(
							seqData,
							createInfo === undefined ? new Set() : new Set<string>(createInfo.ccIds),
							this,
							this.runtime,
							this.serializer,
							posix.join(currentSubDir.absolutePath, subdirName),
							this.logger,
						);
						currentSubDir.populateSubDirectory(subdirName, newSubDir);
						// Record the newly inserted subdirectory to the creation tracker
						currentSubDir.ackedCreationSeqTracker.set(subdirName, {
							...seqData,
						});
					}
					stack.push([newSubDir, subdirObject]);
				}
			}

			if (currentSubDirObject.storage) {
				for (const [key, serializable] of Object.entries(currentSubDirObject.storage)) {
					const parsedSerializable = parseHandles(
						serializable,
						this.serializer,
						// eslint-disable-next-line import/no-deprecated
					) as ISerializableValue;
					migrateIfSharedSerializable(parsedSerializable, this.serializer, this.handle);
					currentSubDir.populateStorage(key, parsedSerializable.value);
				}
			}
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (message.type === MessageType.Operation) {
			const op: IDirectoryOperation = message.contents as IDirectoryOperation;
			const handler = this.messageHandlers.get(op.type);
			assert(
				handler !== undefined,
				0x00e /* "Missing message handler for message type: op may be from a newer version */,
			);
			handler.process(message, op, local, localOpMetadata);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.rollback}
	 */
	protected override rollback(content: unknown, localOpMetadata: unknown): void {
		const op: IDirectoryOperation = content as IDirectoryOperation;
		const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
		if (subdir) {
			subdir.rollback(op, localOpMetadata);
		}
	}

	/**
	 * Converts the given relative path to absolute against the root.
	 * @param relativePath - The path to convert
	 */
	private makeAbsolute(relativePath: string): string {
		return posix.resolve(posix.sep, relativePath);
	}

	/**
	 * This checks if there is pending delete op for local delete for a any subdir in the relative path.
	 * @param relativePath - path of sub directory.
	 * @returns `true` if there is pending delete, `false` otherwise.
	 */
	private isSubDirectoryDeletePending(relativePath: string): boolean {
		const absolutePath = this.makeAbsolute(relativePath);
		if (absolutePath === posix.sep) {
			return false;
		}
		let currentParent = this.root;
		const pathParts = absolutePath.split(posix.sep).slice(1);
		for (const dirName of pathParts) {
			if (currentParent.isSubDirectoryDeletePending(dirName)) {
				return true;
			}
			currentParent = currentParent.getSubDirectory(dirName) as SubDirectory;
			if (currentParent === undefined) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Set the message handlers for the directory.
	 */
	private setMessageHandlers(): void {
		this.messageHandlers.set("clear", {
			process: (
				msg: ISequencedDocumentMessage,
				op: IDirectoryClearOperation,
				local,
				localOpMetadata,
			) => {
				const subdir = this.getWorkingDirectoryEvenIfPendingDelete(op.path) as
					| SubDirectory
					| undefined;
				// Note: We allow processing **remote** messages of subdirectories that are pending delete.
				// This is because if we rollback the pending delete, we want to make sure we still processed the
				// messages that would now be visible.
				if (
					subdir &&
					!subdir.disposed &&
					(!this.isSubDirectoryDeletePending(op.path) || !local)
				) {
					// Add the client ID to enable message processing for existing subdirectories
					if (!local && msg.clientId !== null) {
						subdir.addClientId(msg.clientId);
					}
					subdir.processClearMessage(msg, op, local, localOpMetadata);
				}
			},
			submit: (op: IDirectoryClearOperation, localOpMetadata: unknown) => {
				const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				if (subdir) {
					subdir.resubmitClearMessage(op, localOpMetadata);
				}
			},
		});
		this.messageHandlers.set("delete", {
			process: (
				msg: ISequencedDocumentMessage,
				op: IDirectoryDeleteOperation,
				local,
				localOpMetadata,
			) => {
				const subdir = this.getWorkingDirectoryEvenIfPendingDelete(op.path) as
					| SubDirectory
					| undefined;
				// Note: We allow processing **remote** messages of subdirectories that are pending delete.
				// This is because if we rollback the pending delete, we want to make sure we still processed the
				// messages that would now be visible.
				if (
					subdir &&
					!subdir.disposed &&
					(!this.isSubDirectoryDeletePending(op.path) || !local)
				) {
					// Add the client ID to enable message processing for existing subdirectories
					if (!local && msg.clientId !== null) {
						subdir.addClientId(msg.clientId);
					}
					subdir.processDeleteMessage(msg, op, local, localOpMetadata);
				}
			},
			submit: (op: IDirectoryDeleteOperation, localOpMetadata: unknown) => {
				const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				if (subdir) {
					subdir.resubmitKeyMessage(op, localOpMetadata);
				}
			},
		});
		this.messageHandlers.set("set", {
			process: (
				msg: ISequencedDocumentMessage,
				op: IDirectorySetOperation,
				local,
				localOpMetadata,
			) => {
				const subdir = this.getWorkingDirectoryEvenIfPendingDelete(op.path) as
					| SubDirectory
					| undefined;
				// Note: We allow processing **remote** messages of subdirectories that are pending delete.
				// This is because if we rollback the pending delete, we want to make sure we still processed the
				// messages that would now be visible.
				if (
					subdir &&
					!subdir.disposed &&
					(!this.isSubDirectoryDeletePending(op.path) || !local)
				) {
					// Add the client ID to enable message processing for existing subdirectories
					if (!local && msg.clientId !== null) {
						subdir.addClientId(msg.clientId);
					}
					migrateIfSharedSerializable(op.value, this.serializer, this.handle);
					const localValue: unknown = local ? undefined : op.value.value;
					subdir.processSetMessage(msg, op, localValue, local, localOpMetadata);
				}
			},
			submit: (op: IDirectorySetOperation, localOpMetadata: unknown) => {
				const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				if (subdir) {
					subdir.resubmitKeyMessage(op, localOpMetadata);
				}
			},
		});

		this.messageHandlers.set("createSubDirectory", {
			process: (
				msg: ISequencedDocumentMessage,
				op: IDirectoryCreateSubDirectoryOperation,
				local,
				localOpMetadata,
			) => {
				const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				// Note: We allow processing **remote** messages of subdirectories that are pending delete.
				// This is because if we rollback the pending delete, we want to make sure we still processed the
				// messages that would now be visible.
				if (
					parentSubdir &&
					!parentSubdir.disposed &&
					(!this.isSubDirectoryDeletePending(op.path) || !local)
				) {
					parentSubdir.processCreateSubDirectoryMessage(msg, op, local, localOpMetadata);
				}
			},
			submit: (op: IDirectoryCreateSubDirectoryOperation, localOpMetadata: unknown) => {
				const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				if (parentSubdir) {
					// We don't reuse the metadata but send a new one on each submit.
					parentSubdir.resubmitSubDirectoryMessage(op, localOpMetadata);
				}
			},
		});

		this.messageHandlers.set("deleteSubDirectory", {
			process: (
				msg: ISequencedDocumentMessage,
				op: IDirectoryDeleteSubDirectoryOperation,
				local,
				localOpMetadata,
			) => {
				const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				// Note: We allow processing **remote** messages of subdirectories that are pending delete.
				// This is because if we rollback the pending delete, we want to make sure we still processed the
				// messages that would now be visible.
				if (
					parentSubdir &&
					!parentSubdir.disposed &&
					(!this.isSubDirectoryDeletePending(op.path) || !local)
				) {
					parentSubdir.processDeleteSubDirectoryMessage(msg, op, local, localOpMetadata);
				}
			},
			submit: (op: IDirectoryDeleteSubDirectoryOperation, localOpMetadata: unknown) => {
				const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				if (parentSubdir) {
					// We don't reuse the metadata but send a new one on each submit.
					parentSubdir.resubmitSubDirectoryMessage(op, localOpMetadata);
				}
			},
		});
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
	 */
	protected applyStashedOp(op: unknown): void {
		const directoryOp = op as IDirectoryOperation;
		const dir = this.getWorkingDirectory(directoryOp.path);
		switch (directoryOp.type) {
			case "clear": {
				dir?.clear();
				break;
			}
			case "createSubDirectory": {
				dir?.createSubDirectory(directoryOp.subdirName);
				break;
			}
			case "delete": {
				dir?.delete(directoryOp.key);
				break;
			}
			case "deleteSubDirectory": {
				dir?.deleteSubDirectory(directoryOp.subdirName);
				break;
			}
			case "set": {
				migrateIfSharedSerializable(directoryOp.value, this.serializer, this.handle);
				dir?.set(directoryOp.key, directoryOp.value.value);
				break;
			}
			default: {
				unreachableCase(directoryOp);
			}
		}
	}

	private serializeDirectory(
		root: SubDirectory,
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const MinValueSizeSeparateSnapshotBlob = 8 * 1024;

		const builder = new SummaryTreeBuilder();
		let counter = 0;
		const blobs: string[] = [];

		const stack: [SubDirectory, IDirectoryDataObject][] = [];
		const content: IDirectoryDataObject = {};
		stack.push([root, content]);

		while (stack.length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const [currentSubDir, currentSubDirObject] = stack.pop()!;
			currentSubDirObject.ci = currentSubDir.getSerializableCreateInfo();
			for (const [key, value] of currentSubDir.getSerializedStorage(serializer)) {
				if (!currentSubDirObject.storage) {
					currentSubDirObject.storage = {};
				}
				// eslint-disable-next-line import/no-deprecated
				const result: ISerializableValue = {
					type: value.type,
					value: value.value && (JSON.parse(value.value) as object),
				};
				if (value.value && value.value.length >= MinValueSizeSeparateSnapshotBlob) {
					const extraContent: IDirectoryDataObject = {};
					let largeContent = extraContent;
					if (currentSubDir.absolutePath !== posix.sep) {
						for (const dir of currentSubDir.absolutePath.slice(1).split(posix.sep)) {
							const subDataObject: IDirectoryDataObject = {};
							largeContent.subdirectories = { [dir]: subDataObject };
							largeContent = subDataObject;
						}
					}
					largeContent.storage = { [key]: result };
					const blobName = `blob${counter}`;
					counter++;
					blobs.push(blobName);
					builder.addBlob(blobName, JSON.stringify(extraContent));
				} else {
					currentSubDirObject.storage[key] = result;
				}
			}

			for (const [subdirName, subdir] of currentSubDir.subdirectories()) {
				if (!currentSubDirObject.subdirectories) {
					currentSubDirObject.subdirectories = {};
				}
				const subDataObject: IDirectoryDataObject = {};
				currentSubDirObject.subdirectories[subdirName] = subDataObject;
				stack.push([subdir as SubDirectory, subDataObject]);
			}
		}

		const newFormat: IDirectoryNewStorageFormat = {
			blobs,
			content,
		};
		builder.addBlob(snapshotFileName, JSON.stringify(newFormat));

		return builder.getSummaryTree();
	}
}

interface IKeyEditLocalOpMetadata {
	type: "edit";
	previousValue: unknown;
}

interface IClearLocalOpMetadata {
	type: "clear";
	previousStorage: Map<string, unknown>;
}

interface ICreateSubDirLocalOpMetadata {
	type: "createSubDir";
}

interface IDeleteSubDirLocalOpMetadata {
	type: "deleteSubDir";
	subDirectory: SubDirectory | undefined;
}

type SubDirLocalOpMetadata = ICreateSubDirLocalOpMetadata | IDeleteSubDirLocalOpMetadata;

/**
 * Types of local op metadata.
 */
export type DirectoryLocalOpMetadata =
	| IClearLocalOpMetadata
	| IKeyEditLocalOpMetadata
	| SubDirLocalOpMetadata;

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

function isKeyEditLocalOpMetadata(metadata: any): metadata is IKeyEditLocalOpMetadata {
	return metadata !== undefined && metadata.type === "edit";
}

function isClearLocalOpMetadata(metadata: any): metadata is IClearLocalOpMetadata {
	return (
		metadata !== undefined &&
		metadata.type === "clear" &&
		typeof metadata.previousStorage === "object"
	);
}

function isSubDirLocalOpMetadata(metadata: any): metadata is SubDirLocalOpMetadata {
	return (
		metadata !== undefined &&
		(metadata.type === "createSubDir" || metadata.type === "deleteSubDir")
	);
}

function isDirectoryLocalOpMetadata(metadata: any): metadata is DirectoryLocalOpMetadata {
	return (
		isKeyEditLocalOpMetadata(metadata) ||
		isClearLocalOpMetadata(metadata) ||
		isSubDirLocalOpMetadata(metadata)
	);
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

// eslint-disable-next-line @rushstack/no-new-null
function assertNonNullClientId(clientId: string | null): asserts clientId is string {
	assert(clientId !== null, 0x6af /* client id should never be null */);
}

let hasLoggedDirectoryInconsistency = false;

/**
 * Node of the directory tree.
 * @sealed
 */
class SubDirectory extends TypedEventEmitter<IDirectoryEvents> implements IDirectory {
	/**
	 * Tells if the sub directory is deleted or not.
	 */
	private _deleted = false;

	/**
	 * String representation for the class.
	 */
	public [Symbol.toStringTag]: string = "SubDirectory";

	/**
	 * The subdirectories the directory is holding.
	 */
	private readonly sequencedSubdirectories = new Map<string, SubDirectory>();

	/**
	 * Assigns a unique ID to each subdirectory created locally but pending for acknowledgement, facilitating the tracking
	 * of the creation order.
	 */
	public localCreationSeq: number = 0;

	/**
	 * Maintains a bidirectional association between ack'd subdirectories and their seqData.
	 * This helps to ensure iteration order which is consistent with the JS map spec.
	 */
	public readonly ackedCreationSeqTracker: DirectoryCreationTracker;

	/**
	 * Similar to {@link ackedCreationSeqTracker}, but for local (unacked) entries.
	 */
	public readonly localCreationSeqTracker: DirectoryCreationTracker;

	/**
	 * Constructor.
	 * @param sequenceNumber - Message seq number at which this was created.
	 * @param clientIds - Ids of client which created this directory.
	 * @param directory - Reference back to the SharedDirectory to perform operations
	 * @param runtime - The data store runtime this directory is associated with
	 * @param serializer - The serializer to serialize / parse handles
	 * @param absolutePath - The absolute path of this IDirectory
	 */
	public constructor(
		private readonly seqData: SequenceData,
		private readonly clientIds: Set<string>,
		private readonly directory: SharedDirectory,
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly serializer: IFluidSerializer,
		public readonly absolutePath: string,
		private readonly logger: ITelemetryLoggerExt,
	) {
		super();
		this.localCreationSeqTracker = new DirectoryCreationTracker();
		this.ackedCreationSeqTracker = new DirectoryCreationTracker();
	}

	public dispose(error?: Error): void {
		this._deleted = true;
		this.emit("disposed", this);
	}

	/**
	 * Unmark the deleted property only when rolling back delete.
	 */
	private undispose(): void {
		this._deleted = false;
		this.emit("undisposed", this);
	}

	public get disposed(): boolean {
		return this._deleted;
	}

	private throwIfDisposed(): void {
		if (this._deleted) {
			throw new UsageError("Cannot access Disposed subDirectory");
		}
	}

	/**
	 * Checks whether the given key exists in this IDirectory.
	 * @param key - The key to check
	 * @returns True if the key exists, false otherwise
	 */
	public has(key: string): boolean {
		this.throwIfDisposed();
		return this.optimisticallyHas(key);
	}

	/**
	 * {@inheritDoc IDirectory.get}
	 */
	public get<T = unknown>(key: string): T | undefined {
		return this.getOptimisticLocalValue(key) as T | undefined;
	}

	/**
	 * {@inheritDoc IDirectory.set}
	 */
	public set<T = unknown>(key: string, value: T): this {
		this.throwIfDisposed();
		// Undefined/null keys can't be serialized to JSON in the manner we currently snapshot.
		if (key === undefined || key === null) {
			throw new Error("Undefined and null keys are not supported");
		}
		const localValue = value;
		const previousOptimisticLocalValue = this.getOptimisticLocalValue(key);

		// Create a local value and serialize it.
		bindHandles(value, this.serializer, this.directory.handle);

		// If we are not attached, don't submit the op.
		if (!this.directory.isAttached()) {
			this.sequencedStorageData.set(key, localValue);
			const event: IDirectoryValueChanged = {
				key,
				path: this.absolutePath,
				previousValue: previousOptimisticLocalValue,
			};
			this.directory.emit("valueChanged", event, true, this.directory);
			const containedEvent: IValueChanged = {
				key,
				previousValue: previousOptimisticLocalValue,
			};
			this.emit("containedValueChanged", containedEvent, true, this);
			return this;
		}

		// A new pending key lifetime is created if:
		// 1. There isn't any pending entry for the key yet
		// 2. The most recent pending entry for the key was a deletion (as this terminates the prior lifetime)
		// 3. A clear was sent after the last pending entry for the key (which also terminates the prior lifetime)
		let latestPendingEntry = findLast(
			this.pendingStorageData,
			(entry) => entry.type === "clear" || entry.key === key,
		);
		if (
			latestPendingEntry === undefined ||
			latestPendingEntry.type === "delete" ||
			latestPendingEntry.type === "clear"
		) {
			latestPendingEntry = { type: "lifetime", path: this.absolutePath, key, keySets: [] };
			this.pendingStorageData.push(latestPendingEntry);
		}
		const pendingKeySet: PendingKeySet = {
			type: "set",
			path: this.absolutePath,
			// eslint-disable-next-line import/no-deprecated
			value: localValue as ISerializableValue,
		};
		latestPendingEntry.keySets.push(pendingKeySet);

		const op: IDirectoryOperation = {
			key,
			path: this.absolutePath,
			type: "set",
			value: { type: ValueType[ValueType.Plain], value: localValue },
		};
		this.submitKeyMessage(op, pendingKeySet);

		const event1: IDirectoryValueChanged = {
			key,
			path: this.absolutePath,
			previousValue: previousOptimisticLocalValue,
		};
		this.directory.emit("valueChanged", event1, true, this.directory);
		const containedEvent1: IValueChanged = {
			key,
			previousValue: previousOptimisticLocalValue,
		};
		this.emit("containedValueChanged", containedEvent1, true, this);
		return this;
	}

	/**
	 * {@inheritDoc IDirectory.countSubDirectory}
	 */
	public countSubDirectory(): number {
		return [...this.subdirectories()].length;
	}

	/**
	 * {@inheritDoc IDirectory.createSubDirectory}
	 */
	public createSubDirectory(subdirName: string): IDirectory {
		this.throwIfDisposed();
		// Undefined/null subdirectory names can't be serialized to JSON in the manner we currently snapshot.
		if (subdirName === undefined || subdirName === null) {
			throw new Error("SubDirectory name may not be undefined or null");
		}

		if (subdirName.includes(posix.sep)) {
			throw new Error(`SubDirectory name may not contain ${posix.sep}`);
		}

		let subDir = this.getOptimisticSubDirectory(subdirName);
		const seqData = this.getLocalSeq();
		const clientId = this.runtime.clientId ?? "detached";
		const isNewSubDirectory = subDir === undefined;

		if (subDir === undefined) {
			const absolutePath = posix.join(this.absolutePath, subdirName);
			subDir = new SubDirectory(
				{ ...seqData },
				new Set([clientId]),
				this.directory,
				this.runtime,
				this.serializer,
				absolutePath,
				this.logger,
			);
		} else {
			subDir.clientIds.add(clientId);
		}
		this.registerEventsOnSubDirectory(subDir, subdirName);

		assert(subDir !== undefined, "subdirectory should exist");

		// If we are not attached, don't submit the op.
		if (!this.directory.isAttached()) {
			if (isNewSubDirectory) {
				this.sequencedSubdirectories.set(subdirName, subDir);
				this.emit("subDirectoryCreated", subdirName, true, this);
				this.ackedCreationSeqTracker.set(subdirName, { ...seqData });
			}
			return subDir;
		}

		const pendingSubDirectoryCreate: PendingSubDirectoryCreate = {
			type: "createSubDirectory",
			path: this.absolutePath,
			subdirName,
			subdir: subDir,
		};
		this.pendingSubDirectoryData.push(pendingSubDirectoryCreate);

		const op: IDirectoryCreateSubDirectoryOperation = {
			subdirName,
			path: this.absolutePath,
			type: "createSubDirectory",
		};
		this.submitCreateSubDirectoryMessage(op);
		this.emit("subDirectoryCreated", subdirName, true, this);
		if (isNewSubDirectory) {
			this.localCreationSeqTracker.set(subdirName, {
				...seqData,
			});
		}
		return subDir;
	}

	/**
	 * Gets the Sequence Data which should be used for local changes.
	 *
	 * @remarks While detached, 0 is used rather than -1 to represent a change which should be universally known (as opposed to known
	 * only by the local client). This ensures that if the directory is later attached, none of its data needs to be updated (the values
	 * last set while detached will now be known to any new client, until they are changed).
	 *
	 * The client sequence number is incremented by 1 for maintaining the internal order of locally created subdirectories
	 *
	 * @privateRemarks TODO: Convert these conventions to named constants. The semantics used here match those for merge-tree.
	 */
	private getLocalSeq(): SequenceData {
		return this.directory.isAttached()
			? { seq: -1, clientSeq: ++this.localCreationSeq }
			: { seq: 0, clientSeq: ++this.localCreationSeq };
	}

	/**
	 * {@inheritDoc IDirectory.getSubDirectory}
	 */
	public getSubDirectory(subdirName: string): IDirectory | undefined {
		this.throwIfDisposed();
		const subDir = this.getOptimisticSubDirectory(subdirName);
		// When a client gets access to a subdirectory, add its client ID to enable
		// the subdirectory to process messages from this client
		if (subDir && this.directory.isAttached()) {
			const clientId = this.runtime.clientId ?? "detached";
			subDir.clientIds.add(clientId);
		}
		return subDir;
	}

	/**
	 * Add a client ID to this subdirectory's allowed client list.
	 * This enables the subdirectory to process messages from the specified client.
	 * @param clientId - The client ID to add
	 */
	public addClientId(clientId: string): void {
		this.clientIds.add(clientId);
	}

	/**
	 * {@inheritDoc IDirectory.hasSubDirectory}
	 */
	public hasSubDirectory(subdirName: string): boolean {
		this.throwIfDisposed();
		return this.getOptimisticSubDirectory(subdirName) !== undefined;
	}

	/**
	 * {@inheritDoc IDirectory.deleteSubDirectory}
	 */
	public deleteSubDirectory(subdirName: string): boolean {
		this.throwIfDisposed();

		if (!this.directory.isAttached()) {
			const previousValue = this.sequencedSubdirectories.get(subdirName);
			const successfullyRemoved = this.sequencedSubdirectories.delete(subdirName);
			// Only emit if we actually deleted something.
			if (successfullyRemoved) {
				this.disposeSubDirectoryTree(previousValue);
				this.emit("subDirectoryDeleted", subdirName, true, this);
				this.ackedCreationSeqTracker.delete(subdirName);
			}
			return successfullyRemoved;
		}

		const previousOptimisticSubDirectory = this.getOptimisticSubDirectory(subdirName);
		if (previousOptimisticSubDirectory === undefined) {
			return false;
		}
		const pendingSubdirDelete: PendingSubDirectoryDelete = {
			type: "deleteSubDirectory",
			path: this.absolutePath,
			subdirName,
		};
		this.pendingSubDirectoryData.push(pendingSubdirDelete);

		const op: IDirectoryOperation = {
			subdirName,
			type: "deleteSubDirectory",
			path: this.absolutePath,
		};
		this.submitDeleteSubDirectoryMessage(op, previousOptimisticSubDirectory);
		this.emit("subDirectoryDeleted", subdirName, true, this);
		if (this.localCreationSeqTracker.has(subdirName)) {
			this.localCreationSeqTracker.delete(subdirName);
		}
		return true;
	}

	/**
	 * {@inheritDoc IDirectory.subdirectories}
	 */
	public subdirectories(): IterableIterator<[string, IDirectory]> {
		this.throwIfDisposed();

		// TODO: Cleanup + comments since this is pretty ugly right now
		const ackedSubdirsInOrder = [...this.ackedCreationSeqTracker.keyToIndex.keys()];
		const localSubdirsInOrder = [...this.localCreationSeqTracker.keyToIndex.keys()].filter(
			(entry) => !this.ackedCreationSeqTracker.has(entry),
		);
		const trackedSubdirs = [...ackedSubdirsInOrder, ...localSubdirsInOrder];
		const numTrackedSubdirs = trackedSubdirs.filter((subdirName) => {
			const optimisticSubdir = this.getOptimisticSubDirectory(subdirName);
			return optimisticSubdir !== undefined;
		}).length;
		const numSequencedSubdirs = [...this.sequencedSubdirectories.keys()].filter(
			(subdirName) => {
				const lastPendingEntry = findLast(
					this.pendingSubDirectoryData,
					(entry) => entry.subdirName === subdirName,
				);
				return (
					lastPendingEntry === undefined || lastPendingEntry.type !== "deleteSubDirectory"
				);
			},
		).length;
		const numPendingSubdirs = [
			...new Set(this.pendingSubDirectoryData.map((entry) => entry.subdirName)),
		].filter((subdirName) => {
			const lastPendingEntry = findLast(
				this.pendingSubDirectoryData,
				(entry) => entry.subdirName === subdirName,
			);
			return (
				lastPendingEntry !== undefined &&
				lastPendingEntry.type !== "deleteSubDirectory" &&
				!this.sequencedSubdirectories.has(subdirName)
			);
		}).length;

		// TODO: This may be too aggressive
		// If we decide to keep this assert, then we can remove the telemetry logging below
		assert(
			numTrackedSubdirs === numSequencedSubdirs + numPendingSubdirs,
			"subdirectory count mismatch",
		);
		if (
			numTrackedSubdirs !== numSequencedSubdirs + numPendingSubdirs &&
			// TODO: AB#7022: Hitting this block indicates that the eventual consistency scheme for ordering subdirectories
			// has failed. Fall back to previous directory behavior, which didn't guarantee ordering.
			// It's not currently clear how to reach this state, so log some diagnostics to help understand the issue.
			// This whole block should eventually be replaced by an assert that the two sizes align.
			!hasLoggedDirectoryInconsistency
		) {
			this.logger.sendTelemetryEvent({
				eventName: "inconsistentSubdirectoryOrdering",
				localKeyCount: this.localCreationSeqTracker.size,
				ackedKeyCount: this.ackedCreationSeqTracker.size,
				subdirNamesLength: numTrackedSubdirs,
				subdirectoriesSize: numSequencedSubdirs + numPendingSubdirs,
			});
			hasLoggedDirectoryInconsistency = true;
		}

		// Iterate in creation order by using the tracked subdirectory names from the creation order trackers.
		// This respects the order subdirectories were first created, regardless of whether they are sequenced or pending.
		const trackedSubdirsIterator = trackedSubdirs[Symbol.iterator]();

		const next = (): IteratorResult<[string, IDirectory]> => {
			let nextTrackedSubdir = trackedSubdirsIterator.next();
			while (!nextTrackedSubdir.done) {
				const subdirName = nextTrackedSubdir.value;

				// Check if this subdirectory is optimistically deleted
				const isOptimisticallyDeleted = this.pendingSubDirectoryData.some(
					(entry) => entry.type === "deleteSubDirectory" && entry.subdirName === subdirName,
				);

				if (!isOptimisticallyDeleted) {
					const optimisticSubdir = this.getOptimisticSubDirectory(subdirName);
					if (optimisticSubdir !== undefined) {
						return { value: [subdirName, optimisticSubdir], done: false };
					}
				}
				nextTrackedSubdir = trackedSubdirsIterator.next();
			}

			return { value: undefined, done: true };
		};

		const iterator = {
			next,
			[Symbol.iterator](): IterableIterator<[string, IDirectory]> {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * {@inheritDoc IDirectory.getWorkingDirectory}
	 */
	public getWorkingDirectory(relativePath: string): IDirectory | undefined {
		this.throwIfDisposed();
		return this.directory.getWorkingDirectory(this.makeAbsolute(relativePath));
	}

	/**
	 * This checks if there is pending delete op for local delete for a given child subdirectory.
	 * @param subDirName - directory name.
	 * @returns true if there is pending delete.
	 */
	public isSubDirectoryDeletePending(subDirName: string): boolean {
		const lastPendingEntry = findLast(this.pendingSubDirectoryData, (entry) => {
			return entry.subdirName === subDirName && entry.type === "deleteSubDirectory";
		});
		return lastPendingEntry !== undefined;
	}

	/**
	 * Deletes the given key from within this IDirectory.
	 * @param key - The key to delete
	 * @returns True if the key existed and was deleted, false if it did not exist
	 */
	public delete(key: string): boolean {
		this.throwIfDisposed();
		const previousOptimisticLocalValue = this.getOptimisticLocalValue(key);

		if (!this.directory.isAttached()) {
			const successfullyRemoved = this.sequencedStorageData.delete(key);
			// Only emit if we actually deleted something.
			if (previousOptimisticLocalValue !== undefined && successfullyRemoved) {
				const event: IDirectoryValueChanged = {
					key,
					path: this.absolutePath,
					previousValue: previousOptimisticLocalValue,
				};
				this.directory.emit("valueChanged", event, true, this.directory);
				const containedEvent: IValueChanged = {
					key,
					previousValue: previousOptimisticLocalValue,
				};
				this.emit("containedValueChanged", containedEvent, true, this);
			}
			return successfullyRemoved;
		}

		const pendingKeyDelete: PendingKeyDelete = {
			type: "delete",
			path: this.absolutePath,
			key,
		};
		this.pendingStorageData.push(pendingKeyDelete);

		const op: IDirectoryOperation = {
			key,
			type: "delete",
			path: this.absolutePath,
		};
		this.submitKeyMessage(op, previousOptimisticLocalValue);
		// Only emit if we locally believe we deleted something.  Otherwise we still send the op
		// (permitting speculative deletion even if we don't see anything locally) but don't emit
		// a valueChanged since we in fact did not locally observe a value change.
		if (previousOptimisticLocalValue !== undefined) {
			const event: IDirectoryValueChanged = {
				key,
				path: this.absolutePath,
				previousValue: previousOptimisticLocalValue,
			};
			this.directory.emit("valueChanged", event, true, this.directory);
			const containedEvent: IValueChanged = {
				key,
				previousValue: previousOptimisticLocalValue,
			};
			this.emit("containedValueChanged", containedEvent, true, this);
		}
		return true;
	}

	/**
	 * Deletes all keys from within this IDirectory.
	 */
	public clear(): void {
		this.throwIfDisposed();

		if (!this.directory.isAttached()) {
			this.sequencedStorageData.clear();
			this.directory.emit("clear", true, this.directory);
			return;
		}

		const pendingClear: PendingClear = {
			type: "clear",
			path: this.absolutePath,
		};
		this.pendingStorageData.push(pendingClear);

		const copy = new Map<string, unknown>(this.sequencedStorageData);
		this.directory.emit("clear", true, this.directory);
		const op: IDirectoryOperation = {
			type: "clear",
			path: this.absolutePath,
		};
		this.submitClearMessage(op, copy);
	}

	/**
	 * Issue a callback on each entry under this IDirectory.
	 * @param callback - Callback to issue
	 */
	public forEach(
		callback: (value: unknown, key: string, map: Map<string, unknown>) => void,
	): void {
		this.throwIfDisposed();
		// It would be better to iterate over the data without a temp map.  However, we don't have a valid
		// map to pass for the third argument here (really, it should probably should be a reference to the
		// SharedMap and not the MapKernel).
		const tempMap = new Map(this.internalIterator());
		// eslint-disable-next-line unicorn/no-array-for-each
		tempMap.forEach((localValue, key, m) => {
			callback((localValue as { value: unknown }).value, key, m);
		});
	}

	/**
	 * The number of entries under this IDirectory.
	 */
	public get size(): number {
		this.throwIfDisposed();
		return [...this.internalIterator()].length;
	}

	/**
	 * Get an iterator over the entries under this IDirectory.
	 * @returns The iterator
	 */
	public entries(): IterableIterator<[string, unknown]> {
		this.throwIfDisposed();
		const internalIterator = this.internalIterator();
		const next = (): IteratorResult<[string, unknown]> => {
			const nextResult = internalIterator.next();
			if (nextResult.done) {
				return { value: undefined, done: true };
			}
			// Unpack the stored value
			const [key, localValue] = nextResult.value;
			return { value: [key, localValue], done: false };
		};

		const iterator = {
			next,
			[Symbol.iterator](): IterableIterator<[string, unknown]> {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * Get an iterator over the keys under this IDirectory.
	 * @returns The iterator
	 */
	public keys(): IterableIterator<string> {
		this.throwIfDisposed();
		const internalIterator = this.internalIterator();
		const next = (): IteratorResult<string> => {
			const nextResult = internalIterator.next();
			if (nextResult.done) {
				return { value: undefined, done: true };
			}
			const [key] = nextResult.value;
			return { value: key, done: false };
		};
		const iterator = {
			next,
			[Symbol.iterator](): IterableIterator<string> {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * Get an iterator over the values under this IDirectory.
	 * @returns The iterator
	 */
	public values(): IterableIterator<unknown> {
		this.throwIfDisposed();
		const internalIterator = this.internalIterator();
		const next = (): IteratorResult<unknown> => {
			const nextResult = internalIterator.next();
			if (nextResult.done) {
				return { value: undefined, done: true };
			}
			const [, localValue] = nextResult.value;
			return { value: localValue, done: false };
		};
		const iterator = {
			next,
			[Symbol.iterator](): IterableIterator<unknown> {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * Get an iterator over the entries under this IDirectory.
	 * @returns The iterator
	 */
	public [Symbol.iterator](): IterableIterator<[string, unknown]> {
		this.throwIfDisposed();
		return this.internalIterator();
	}

	/**
	 * The data the directory is storing, but only including sequenced values (no local pending
	 * modifications are included).
	 */
	private readonly sequencedStorageData = new Map<string, unknown>();

	/**
	 * A data structure containing all local pending storage modifications, which is used in combination
	 * with the sequencedStorageData to compute optimistic values.
	 *
	 * Pending sets are aggregated into "lifetimes", which permit correct relative iteration order
	 * even across remote operations and rollbacks.
	 */
	private readonly pendingStorageData: PendingStorageEntry[] = [];

	/**
	 * A data structure containing all local pending subdirectory modifications, which is used in combination
	 * with the sequencedSubdirectories to compute optimistic values.
	 *
	 * Pending subdirectory creates are aggregated into "lifetimes", which permit correct relative iteration order
	 * even across remote operations and rollbacks.
	 */
	private readonly pendingSubDirectoryData: PendingSubDirectoryEntry[] = [];

	/**
	 * An internal iterator that iterates over the entries in the directory.
	 */
	private readonly internalIterator = (): IterableIterator<[string, unknown]> => {
		// We perform iteration in two steps - first by iterating over members of the sequenced data that are not
		// optimistically deleted or cleared, and then over the pending data lifetimes that have not subsequently
		// been deleted or cleared.  In total, this give an ordering of members based on when they were initially
		// added to the map (even if they were later modified), similar to the native Map.
		const sequencedStorageDataIterator = this.sequencedStorageData.keys();
		const pendingStorageDataIterator = this.pendingStorageData.values();
		const next = (): IteratorResult<[string, unknown]> => {
			let nextSequencedKey = sequencedStorageDataIterator.next();
			while (!nextSequencedKey.done) {
				const key = nextSequencedKey.value;
				// If we have any pending deletes or clears, then we won't iterate to this key yet (if at all).
				// Either it is optimistically deleted and will not be part of the iteration, or it was
				// re-added later and we'll iterate to it when we get to the pending data.
				if (
					!this.pendingStorageData.some(
						(entry) =>
							entry.type === "clear" || (entry.type === "delete" && entry.key === key),
					)
				) {
					assert(this.has(key), "key should exist in sequenced or pending data");
					const optimisticValue = this.getOptimisticLocalValue(key);
					return { value: [key, optimisticValue], done: false };
				}
				nextSequencedKey = sequencedStorageDataIterator.next();
			}

			let nextPending = pendingStorageDataIterator.next();
			while (!nextPending.done) {
				const nextPendingEntry = nextPending.value;
				// A lifetime entry may need to be iterated.
				if (nextPendingEntry.type === "lifetime") {
					const nextPendingEntryIndex = this.pendingStorageData.indexOf(nextPendingEntry);
					const mostRecentDeleteOrClearIndex = findLastIndex(
						this.pendingStorageData,
						(entry) =>
							entry.type === "clear" ||
							(entry.type === "delete" && entry.key === nextPendingEntry.key),
					);
					// Only iterate the pending entry now if it hasn't been deleted or cleared.
					if (nextPendingEntryIndex > mostRecentDeleteOrClearIndex) {
						const latestPendingValue =
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							nextPendingEntry.keySets[nextPendingEntry.keySets.length - 1]!;
						// Skip iterating if we would have would have already iterated it as part of the sequenced data.
						// This is not a perfect check in the case the map has changed since the iterator was created
						// (e.g. if a remote client added the same key in the meantime).
						if (
							!this.sequencedStorageData.has(nextPendingEntry.key) ||
							mostRecentDeleteOrClearIndex !== -1
						) {
							return { value: [nextPendingEntry.key, latestPendingValue.value], done: false };
						}
					}
				}
				nextPending = pendingStorageDataIterator.next();
			}

			return { value: undefined, done: true };
		};

		const iterator = {
			next,
			[Symbol.iterator](): IterableIterator<[string, unknown]> {
				return this;
			},
		};
		return iterator;
	};

	/**
	 * Compute the optimistic local value for a given key. This combines the sequenced data with
	 * any pending changes that have not yet been sequenced.
	 */
	private readonly getOptimisticLocalValue = (key: string): unknown => {
		const latestPendingEntry = findLast(
			this.pendingStorageData,
			(entry) => entry.type === "clear" || entry.key === key,
		);

		if (latestPendingEntry === undefined) {
			return this.sequencedStorageData.get(key);
		} else if (latestPendingEntry.type === "lifetime") {
			const latestPendingSet =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				latestPendingEntry.keySets[latestPendingEntry.keySets.length - 1]!;
			return latestPendingSet.value;
		} else {
			// Delete or clear
			return undefined;
		}
	};

	/**
	 * Determine if the directory optimistically has the key.
	 * This will return true even if the value is undefined.
	 */
	private readonly optimisticallyHas = (key: string): boolean => {
		const latestPendingEntry = findLast(
			this.pendingStorageData,
			(entry) => entry.type === "clear" || entry.key === key,
		);

		return latestPendingEntry === undefined
			? this.sequencedStorageData.has(key)
			: latestPendingEntry.type === "lifetime";
	};

	private readonly getOptimisticSubDirectory = (
		subdirName: string,
		getIfDisposed = false,
	): SubDirectory | undefined => {
		const latestPendingEntry = findLast(
			this.pendingSubDirectoryData,
			(entry) => entry.subdirName === subdirName,
		);
		let subdir: SubDirectory | undefined;
		if (latestPendingEntry === undefined) {
			subdir = this.sequencedSubdirectories.get(subdirName);
		} else if (latestPendingEntry.type === "createSubDirectory") {
			subdir = latestPendingEntry.subdir;
			assert(subdir !== undefined, "Subdirectory should exist in pending data");
		} else {
			// Pending delete
			return undefined;
		}

		// If the subdirectory is disposed, treat it as non-existent for optimistic reads
		if (subdir?.disposed && !getIfDisposed) {
			return undefined;
		}

		return subdir;
	};

	public readonly getSubDirectoryEvenIfPendingDelete = (
		subdirName: string,
	): SubDirectory | undefined => {
		const latestPendingEntry = findLast(
			this.pendingSubDirectoryData,
			(entry) => entry.subdirName === subdirName && entry.type === "createSubDirectory",
		);
		if (latestPendingEntry === undefined) {
			return this.sequencedSubdirectories.get(subdirName);
		} else {
			assert(
				latestPendingEntry.type === "createSubDirectory",
				"Expected pending entry to be a create subdirectory",
			);
			const latestPendingSubdirCreate = latestPendingEntry.subdir;
			assert(latestPendingSubdirCreate !== undefined, "Subdirectory should exist");
			return latestPendingSubdirCreate;
		}
	};

	/**
	 * Process a clear operation.
	 * @param msg - The message from the server to apply.
	 * @param op - The op to process
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	public processClearMessage(
		msg: ISequencedDocumentMessage,
		op: IDirectoryClearOperation,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.throwIfDisposed();
		if (!this.isMessageForCurrentInstanceOfSubDirectory(msg)) {
			return;
		}

		if (local) {
			this.sequencedStorageData.clear();
			const pendingClear = this.pendingStorageData.shift();
			assert(
				pendingClear !== undefined && pendingClear.type === "clear",
				"Got a local clear message we weren't expecting",
			);
			assert(isClearLocalOpMetadata(localOpMetadata), "Local op metadata should be a clear");
		} else {
			// For pending set operations, collect the previous values before clearing sequenced data
			const pendingSets: { key: string; previousValue: unknown }[] = [];
			for (const entry of this.pendingStorageData) {
				if (entry.type === "lifetime") {
					const previousValue = this.sequencedStorageData.get(entry.key);
					pendingSets.push({ key: entry.key, previousValue });
				}
			}
			this.sequencedStorageData.clear();

			// Only emit for remote ops, we would have already emitted for local ops. Only emit if there
			// is no optimistically-applied local pending clear that would supersede this remote clear.
			if (!this.pendingStorageData.some((entry) => entry.type === "clear")) {
				this.directory.emit("clear", local, this.directory);
			}

			// For pending set operations, emit valueChanged events
			for (const { key, previousValue } of pendingSets) {
				this.directory.emit(
					"valueChanged",
					{
						key,
						previousValue,
					},
					local,
					this.directory,
				);
			}
		}
	}

	/**
	 * Process a delete operation.
	 * @param msg - The message from the server to apply.
	 * @param op - The op to process
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	public processDeleteMessage(
		msg: ISequencedDocumentMessage,
		op: IDirectoryDeleteOperation,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.throwIfDisposed();
		if (!this.isMessageForCurrentInstanceOfSubDirectory(msg)) {
			return;
		}
		if (local) {
			const pendingEntryIndex = this.pendingStorageData.findIndex(
				(entry) => entry.type !== "clear" && entry.key === op.key,
			);
			const pendingEntry = this.pendingStorageData[pendingEntryIndex];
			assert(
				pendingEntry !== undefined &&
					pendingEntry.type === "delete" &&
					pendingEntry.key === op.key,
				"Got a local delete message we weren't expecting",
			);
			this.pendingStorageData.splice(pendingEntryIndex, 1);
			this.sequencedStorageData.delete(op.key);
		} else {
			const previousValue: unknown = this.sequencedStorageData.get(op.key);
			this.sequencedStorageData.delete(op.key);
			// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
			if (
				!this.pendingStorageData.some(
					(entry) => entry.type === "clear" || entry.key === op.key,
				)
			) {
				const event: IDirectoryValueChanged = {
					key: op.key,
					path: this.absolutePath,
					previousValue,
				};
				this.directory.emit("valueChanged", event, local, this.directory);
				const containedEvent: IValueChanged = { key: op.key, previousValue };
				this.emit("containedValueChanged", containedEvent, local, this);
			}
		}
	}

	/**
	 * Process a set operation.
	 * @param msg - The message from the server to apply.
	 * @param op - The op to process
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	public processSetMessage(
		msg: ISequencedDocumentMessage,
		op: IDirectorySetOperation,
		value: unknown,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.throwIfDisposed();
		if (!this.isMessageForCurrentInstanceOfSubDirectory(msg)) {
			return;
		}

		const { key } = op;

		if (local) {
			const pendingEntryIndex = this.pendingStorageData.findIndex(
				(entry) => entry.type !== "clear" && entry.key === key,
			);
			const pendingEntry = this.pendingStorageData[pendingEntryIndex];
			assert(
				pendingEntry !== undefined && pendingEntry.type === "lifetime",
				"Got a local set message we weren't expecting",
			);
			const pendingKeySet = pendingEntry.keySets.shift();
			assert(pendingKeySet !== undefined, "pending lifetime should exist");
			if (pendingEntry.keySets.length === 0) {
				this.pendingStorageData.splice(pendingEntryIndex, 1);
			}
			this.sequencedStorageData.set(key, pendingKeySet.value);
		} else {
			// Get the previous value before setting the new value
			const previousValue: unknown = this.sequencedStorageData.get(key);
			this.sequencedStorageData.set(key, value);

			// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
			if (
				!this.pendingStorageData.some((entry) => entry.type === "clear" || entry.key === key)
			) {
				const event: IDirectoryValueChanged = { key, path: this.absolutePath, previousValue };
				this.directory.emit("valueChanged", event, local, this.directory);
				const containedEvent: IValueChanged = { key, previousValue };
				this.emit("containedValueChanged", containedEvent, local, this);
			}
		}
	}

	/**
	 * Process a create subdirectory operation.
	 * @param msg - The message from the server to apply.
	 * @param op - The op to process
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	public processCreateSubDirectoryMessage(
		msg: ISequencedDocumentMessage,
		op: IDirectoryCreateSubDirectoryOperation,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.throwIfDisposed();

		if (!this.isMessageForCurrentInstanceOfSubDirectory(msg)) {
			return;
		}
		assertNonNullClientId(msg.clientId);

		if (local) {
			const pendingEntryIndex = this.pendingSubDirectoryData.findIndex(
				(entry) => entry.subdirName === op.subdirName,
			);
			const pendingEntry = this.pendingSubDirectoryData[pendingEntryIndex];
			assert(
				pendingEntry !== undefined &&
					pendingEntry.type === "createSubDirectory" &&
					pendingEntry.subdir !== undefined &&
					isSubDirLocalOpMetadata(localOpMetadata) &&
					localOpMetadata.type === "createSubDir",
				"Got a local subdir create message we weren't expecting",
			);
			this.pendingSubDirectoryData.splice(pendingEntryIndex, 1);

			this.sequencedSubdirectories.set(op.subdirName, pendingEntry.subdir);

			this.emit("subDirectoryCreated", op.subdirName, local, this);

			this.ackedCreationSeqTracker.set(op.subdirName, {
				seq: msg.sequenceNumber,
				clientSeq: msg.clientSequenceNumber,
			});
		} else {
			let subdir = this.getOptimisticSubDirectory(op.subdirName, true);
			if (subdir === undefined) {
				const absolutePath = posix.join(this.absolutePath, op.subdirName);
				subdir = new SubDirectory(
					{ seq: msg.sequenceNumber, clientSeq: msg.clientSequenceNumber },
					new Set([msg.clientId]),
					this.directory,
					this.runtime,
					this.serializer,
					absolutePath,
					this.logger,
				);
			} else {
				if (subdir.disposed) {
					this.undeleteSubDirectoryTree(subdir);
				}
				// If the subdirectory already optimistically exists, we don't need to create it again.
				// This can happen if remote clients also create the same subdir
				subdir.clientIds.add(msg.clientId);
			}
			this.registerEventsOnSubDirectory(subdir, op.subdirName);
			this.sequencedSubdirectories.set(op.subdirName, subdir);
			this.ackedCreationSeqTracker.set(op.subdirName, {
				seq: msg.sequenceNumber,
				clientSeq: msg.clientSequenceNumber,
			});
			if (this.localCreationSeqTracker.has(op.subdirName)) {
				this.localCreationSeqTracker.delete(op.subdirName);
			}
			// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
			if (!this.pendingSubDirectoryData.some((entry) => entry.subdirName === op.subdirName)) {
				this.emit("subDirectoryCreated", op.subdirName, local, this);
			}
		}
	}

	/**
	 * Process a delete subdirectory operation.
	 * @param msg - The message from the server to apply.
	 * @param op - The op to process
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	public processDeleteSubDirectoryMessage(
		msg: ISequencedDocumentMessage,
		op: IDirectoryDeleteSubDirectoryOperation,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.throwIfDisposed();
		if (!this.isMessageForCurrentInstanceOfSubDirectory(msg)) {
			return;
		}

		const previousValue = this.sequencedSubdirectories.get(op.subdirName);
		if (previousValue === undefined) {
			return;
		}

		if (this.ackedCreationSeqTracker.has(op.subdirName)) {
			this.ackedCreationSeqTracker.delete(op.subdirName);
		}
		if (this.localCreationSeqTracker.has(op.subdirName)) {
			this.localCreationSeqTracker.delete(op.subdirName);
		}

		this.sequencedSubdirectories.delete(op.subdirName);

		if (local) {
			const pendingEntryIndex = this.pendingSubDirectoryData.findIndex(
				(entry) => entry.subdirName === op.subdirName,
			);
			const pendingEntry = this.pendingSubDirectoryData[pendingEntryIndex];
			assert(
				pendingEntry !== undefined &&
					pendingEntry.type === "deleteSubDirectory" &&
					pendingEntry.subdirName === op.subdirName,
				"Got a local deleteSubDirectory message we weren't expecting",
			);
			this.pendingSubDirectoryData.splice(pendingEntryIndex, 1);
			this.sequencedSubdirectories.delete(op.subdirName);
			this.disposeSubDirectoryTree(previousValue);
		} else {
			// We still try to dispose the subdirectory tree in case the subdirectories do not also have pending creates
			this.disposeSubDirectoryTree(previousValue);

			// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
			const pendingEntryIndex = this.pendingSubDirectoryData.findIndex(
				(entry) => entry.subdirName === op.subdirName && entry.type === "deleteSubDirectory",
			);
			const pendingEntry = this.pendingSubDirectoryData[pendingEntryIndex];
			if (pendingEntry !== undefined) {
				this.emit("subDirectoryDeleted", op.subdirName, local, this);
			}
		}

		// If we get a remote delete op and we have a pending create for the same subdirectory,
		// then we should clear the sequenced data for that subdirectory so it will start from an
		// empty state.
		const nextPendingIndex = this.pendingSubDirectoryData.findIndex(
			(entry) => entry.subdirName === op.subdirName,
		);
		const nextPendingEntry = this.pendingSubDirectoryData[nextPendingIndex];
		if (nextPendingEntry !== undefined && nextPendingEntry.type === "createSubDirectory") {
			nextPendingEntry.subdir.sequencedStorageData.clear();
			nextPendingEntry.subdir.sequencedSubdirectories.clear();
		}
	}

	/**
	 * Submit a clear operation.
	 * @param op - The operation
	 */
	private submitClearMessage(
		op: IDirectoryClearOperation,
		previousValue: Map<string, unknown>,
	): void {
		this.throwIfDisposed();
		const metadata: IClearLocalOpMetadata = {
			type: "clear",
			previousStorage: previousValue,
		};
		this.directory.submitDirectoryMessage(op, metadata);
	}

	/**
	 * Resubmit a clear operation.
	 * @param op - The operation
	 */
	public resubmitClearMessage(op: IDirectoryClearOperation, localOpMetadata: unknown): void {
		assert(
			isClearLocalOpMetadata(localOpMetadata),
			0x32b /* Invalid localOpMetadata for clear */,
		);

		// Don't resubmit if this subdirectory is disposed
		if (this.disposed) {
			return;
		}

		// Only submit the op, if we have record for it, otherwise it is possible that the older instance
		// is already deleted, in which case we don't need to submit the op.
		const pendingEntryIndex = this.pendingStorageData.findIndex(
			(entry) => entry.type === "clear",
		);
		const pendingEntry = this.pendingStorageData[pendingEntryIndex];
		if (pendingEntry !== undefined) {
			this.submitClearMessage(op, localOpMetadata.previousStorage);
		}
	}

	/**
	 * Submit a key operation.
	 * @param op - The operation
	 * @param previousValue - The value of the key before this op
	 */
	private submitKeyMessage(op: IDirectoryKeyOperation, previousValue?: unknown): void {
		this.throwIfDisposed();
		const localMetadata = { type: "edit", previousValue };
		this.directory.submitDirectoryMessage(op, localMetadata);
	}

	/**
	 * Submit a key message to remote clients based on a previous submit.
	 * @param op - The map key message
	 * @param localOpMetadata - Metadata from the previous submit
	 */
	public resubmitKeyMessage(op: IDirectoryKeyOperation, localOpMetadata: unknown): void {
		assert(
			isKeyEditLocalOpMetadata(localOpMetadata),
			0x32d /* Invalid localOpMetadata in submit */,
		);

		// Don't resubmit if this subdirectory is disposed
		if (this.disposed) {
			return;
		}

		// Only submit the op, if we have record for it, otherwise it is possible that the older instance
		// is already deleted, in which case we don't need to submit the op.
		const pendingEntryIndex = this.pendingStorageData.findIndex(
			(entry) => entry.type !== "clear" && entry.key === op.key,
		);
		const pendingEntry = this.pendingStorageData[pendingEntryIndex];
		if (pendingEntry !== undefined) {
			this.submitKeyMessage(op, localOpMetadata.previousValue);
		}
	}
	/**
	 * Submit a create subdirectory operation.
	 * @param op - The operation
	 */
	private submitCreateSubDirectoryMessage(op: IDirectorySubDirectoryOperation): void {
		this.throwIfDisposed();

		const localOpMetadata: ICreateSubDirLocalOpMetadata = {
			type: "createSubDir",
		};
		this.directory.submitDirectoryMessage(op, localOpMetadata);
	}

	/**
	 * Submit a delete subdirectory operation.
	 * @param op - The operation
	 * @param subDir - Any subdirectory deleted by the op
	 */
	private submitDeleteSubDirectoryMessage(
		op: IDirectorySubDirectoryOperation,
		subDir: SubDirectory | undefined,
	): void {
		this.throwIfDisposed();

		const localOpMetadata: IDeleteSubDirLocalOpMetadata = {
			type: "deleteSubDir",
			subDirectory: subDir,
		};
		this.directory.submitDirectoryMessage(op, localOpMetadata);
	}

	/**
	 * Submit a subdirectory operation again
	 * @param op - The operation
	 * @param localOpMetadata - metadata submitted with the op originally
	 */
	public resubmitSubDirectoryMessage(
		op: IDirectorySubDirectoryOperation,
		localOpMetadata: unknown,
	): void {
		assert(
			isSubDirLocalOpMetadata(localOpMetadata),
			0x32f /* Invalid localOpMetadata for sub directory op */,
		);

		// Don't resubmit if this subdirectory is disposed
		if (this.disposed) {
			return;
		}

		// Only submit the op, if we have record for it, otherwise it is possible that the older instance
		// is already deleted, in which case we don't need to submit the op.
		if (localOpMetadata.type === "createSubDir") {
			// For create operations, look specifically for lifetimeSubDirectory entries
			const pendingEntryIndex = this.pendingSubDirectoryData.findIndex(
				(entry) => entry.subdirName === op.subdirName && entry.type === "createSubDirectory",
			);
			const pendingEntry = this.pendingSubDirectoryData[pendingEntryIndex];
			if (pendingEntry !== undefined) {
				this.submitCreateSubDirectoryMessage(op);
			}
		} else if (localOpMetadata.type === "deleteSubDir") {
			// For delete operations, look specifically for deleteSubDirectory entries
			const pendingEntryIndex = this.pendingSubDirectoryData.findIndex(
				(entry) => entry.subdirName === op.subdirName && entry.type === "deleteSubDirectory",
			);
			const pendingEntry = this.pendingSubDirectoryData[pendingEntryIndex];
			if (pendingEntry !== undefined) {
				this.submitDeleteSubDirectoryMessage(op, localOpMetadata.subDirectory);
			}
		}
	}

	/**
	 * Get the storage of this subdirectory in a serializable format, to be used in snapshotting.
	 * @param serializer - The serializer to use to serialize handles in its values.
	 * @returns The JSONable string representing the storage of this subdirectory
	 */
	public *getSerializedStorage(
		serializer: IFluidSerializer,
	): Generator<[string, ISerializedValue], void> {
		this.throwIfDisposed();
		for (const [key, value] of this.sequencedStorageData.entries()) {
			const serializedValue = serializeValue(value, serializer, this.directory.handle);
			const res: [string, ISerializedValue] = [key, serializedValue];
			yield res;
		}
	}

	public getSerializableCreateInfo(): ICreateInfo {
		this.throwIfDisposed();
		const createInfo: ICreateInfo = {
			csn: this.seqData.seq,
			ccIds: [...this.clientIds],
		};
		return createInfo;
	}

	/**
	 * Populate a key value in this subdirectory's storage, to be used when loading from snapshot.
	 * @param key - The key to populate
	 * @param localValue - The local value to populate into it
	 */
	public populateStorage(key: string, value: unknown): void {
		this.throwIfDisposed();
		this.sequencedStorageData.set(key, value);
	}

	/**
	 * Populate a subdirectory into this subdirectory, to be used when loading from snapshot.
	 * @param subdirName - The name of the subdirectory to add
	 * @param newSubDir - The new subdirectory to add
	 */
	public populateSubDirectory(subdirName: string, newSubDir: SubDirectory): void {
		this.throwIfDisposed();
		this.registerEventsOnSubDirectory(newSubDir, subdirName);
		this.sequencedSubdirectories.set(subdirName, newSubDir);
	}

	/**
	 * Retrieve the local value at the given key.  This is used to get value type information stashed on the local
	 * value so op handlers can be retrieved
	 * @param key - The key to retrieve from
	 * @returns The local value
	 */
	public getLocalValue<T>(key: string): T {
		this.throwIfDisposed();
		return this.getOptimisticLocalValue(key) as T;
	}

	/**
	 * Rollback a local op
	 * @param op - The operation to rollback
	 * @param localOpMetadata - The local metadata associated with the op.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public rollback(op: any, localOpMetadata: unknown): void {
		if (!isDirectoryLocalOpMetadata(localOpMetadata)) {
			throw new Error("Invalid localOpMetadata");
		}
		const directoryOp = op as IDirectoryOperation;

		if (directoryOp.type === "clear") {
			// A pending clear will be last in the list, since it terminates all prior lifetimes.
			const pendingClear = this.pendingStorageData.pop();
			assert(
				pendingClear !== undefined &&
					pendingClear.type === "clear" &&
					localOpMetadata.type === "clear",
				"Unexpected clear rollback",
			);
			for (const [key] of this.internalIterator()) {
				const event: IDirectoryValueChanged = {
					key,
					path: this.absolutePath,
					previousValue: undefined,
				};
				this.directory.emit("valueChanged", event, true, this.directory);
				const containedEvent: IValueChanged = { key, previousValue: undefined };
				this.emit("containedValueChanged", containedEvent, true, this);
			}
		} else if (
			(directoryOp.type === "delete" || directoryOp.type === "set") &&
			localOpMetadata.type === "edit"
		) {
			// A pending set/delete may not be last in the list, as the lifetimes' order is based on when
			// they were created, not when they were last modified.
			const pendingEntryIndex = findLastIndex(
				this.pendingStorageData,
				(entry) => entry.type !== "clear" && entry.key === directoryOp.key,
			);
			const pendingEntry = this.pendingStorageData[pendingEntryIndex];
			assert(
				pendingEntry !== undefined &&
					(pendingEntry.type === "delete" || pendingEntry.type === "lifetime"),
				"Unexpected pending data for set/delete op",
			);
			if (pendingEntry.type === "delete") {
				this.pendingStorageData.splice(pendingEntryIndex, 1);
				// Only emit if rolling back the delete actually results in a value becoming visible.
				if (this.getOptimisticLocalValue(directoryOp.key) !== undefined) {
					const event: IDirectoryValueChanged = {
						key: directoryOp.key,
						path: this.absolutePath,
						previousValue: undefined,
					};
					this.directory.emit("valueChanged", event, true, this.directory);
					const containedEvent: IValueChanged = {
						key: directoryOp.key,
						previousValue: undefined,
					};
					this.emit("containedValueChanged", containedEvent, true, this);
				}
			} else if (pendingEntry.type === "lifetime") {
				const pendingKeySet = pendingEntry.keySets.pop();
				assert(
					pendingKeySet !== undefined && pendingKeySet === localOpMetadata.previousValue,
					"Unexpected set rollback",
				);
				if (pendingEntry.keySets.length === 0) {
					this.pendingStorageData.splice(pendingEntryIndex, 1);
				}
				const event: IDirectoryValueChanged = {
					key: directoryOp.key,
					path: this.absolutePath,
					previousValue: pendingKeySet.value,
				};
				this.directory.emit("valueChanged", event, true, this.directory);
				const containedEvent: IValueChanged = {
					key: directoryOp.key,
					previousValue: pendingKeySet.value,
				};
				this.emit("containedValueChanged", containedEvent, true, this);
			}
		} else if (
			directoryOp.type === "createSubDirectory" &&
			localOpMetadata.type === "createSubDir"
		) {
			const subdirName = directoryOp.subdirName;

			const pendingEntryIndex = findLastIndex(
				this.pendingSubDirectoryData,
				(entry) => entry.type === "createSubDirectory" && entry.subdirName === subdirName,
			);
			const pendingEntry = this.pendingSubDirectoryData[pendingEntryIndex];
			assert(
				pendingEntry !== undefined && pendingEntry.type === "createSubDirectory",
				"Unexpected pending data for createSubDirectory op",
			);
			this.pendingSubDirectoryData.splice(pendingEntryIndex, 1);
			this.emit("subDirectoryDeleted", subdirName, true, this);
			if (this.localCreationSeqTracker.has(subdirName)) {
				this.localCreationSeqTracker.delete(subdirName);
			}
		} else if (
			directoryOp.type === "deleteSubDirectory" &&
			localOpMetadata.type === "deleteSubDir"
		) {
			const subdirName = directoryOp.subdirName;

			const pendingEntryIndex = findLastIndex(
				this.pendingSubDirectoryData,
				(entry) => entry.type === "deleteSubDirectory" && entry.subdirName === subdirName,
			);
			const pendingEntry = this.pendingSubDirectoryData[pendingEntryIndex];
			assert(
				pendingEntry !== undefined && pendingEntry.type === "deleteSubDirectory",
				"Unexpected pending data for deleteSubDirectory op",
			);
			this.pendingSubDirectoryData.splice(pendingEntryIndex, 1);

			// Restore the subdirectory from the metadata if available
			const subDirectoryToRestore = localOpMetadata.subDirectory;
			if (subDirectoryToRestore !== undefined) {
				if (isAcknowledgedOrDetached(subDirectoryToRestore.seqData)) {
					this.ackedCreationSeqTracker.set(subdirName, {
						...subDirectoryToRestore.seqData,
					});
					// Since this was an ack'd subdirectory, we need to re-add it to the sequenced subdirectories
					this.sequencedSubdirectories.set(subdirName, subDirectoryToRestore);
				} else {
					this.localCreationSeqTracker.set(subdirName, {
						...subDirectoryToRestore.seqData,
					});
				}

				// Re-register events
				this.registerEventsOnSubDirectory(subDirectoryToRestore, subdirName);
				this.emit("subDirectoryCreated", subdirName, true, this);

				// Recursively undispose all nested subdirectories before adding to the map
				// This ensures the subdirectory is properly restored before being exposed
				this.undeleteSubDirectoryTree(subDirectoryToRestore);
			}
		} else {
			throw new Error("Unsupported op for rollback");
		}
	}

	/**
	 * Converts the given relative path into an absolute path.
	 * @param path - Relative path to convert
	 * @returns The equivalent absolute path
	 */
	private makeAbsolute(relativePath: string): string {
		return posix.resolve(this.absolutePath, relativePath);
	}

	/**
	 * This return true if the message is for the current instance of this sub directory. As the sub directory
	 * can be deleted and created again, then this finds if the message is for current instance of directory or not.
	 * @param msg - message for the directory
	 */
	private isMessageForCurrentInstanceOfSubDirectory(msg: ISequencedDocumentMessage): boolean {
		// If the message is either from the creator of directory or this directory was created when
		// container was detached or in case this directory is already live(known to other clients)
		// and the op was created after the directory was created then apply this op.
		return (
			(msg.clientId !== null && this.clientIds.has(msg.clientId)) ||
			this.clientIds.has("detached") ||
			(isAcknowledgedOrDetached(this.seqData) &&
				this.seqData.seq <= msg.referenceSequenceNumber)
		);
	}

	private registerEventsOnSubDirectory(subDirectory: SubDirectory, subDirName: string): void {
		subDirectory.on("subDirectoryCreated", (relativePath: string, local: boolean) => {
			this.emit("subDirectoryCreated", posix.join(subDirName, relativePath), local, this);
		});
		subDirectory.on("subDirectoryDeleted", (relativePath: string, local: boolean) => {
			this.emit("subDirectoryDeleted", posix.join(subDirName, relativePath), local, this);
		});
	}

	private disposeSubDirectoryTree(directory: IDirectory | undefined): void {
		if (!directory) {
			return;
		}
		// Dispose the subdirectory tree. This will dispose the subdirectories from bottom to top.
		const subDirectories = directory.subdirectories();
		for (const [subdirName, subDirectory] of subDirectories) {
			if (
				this.pendingSubDirectoryData.some(
					(entry) => entry.subdirName === subdirName && entry.type === "createSubDirectory",
				)
			) {
				// If the directory is pending, we do not dispose it, as it will be restored later.
				return;
			}

			this.disposeSubDirectoryTree(subDirectory);
		}
		if (typeof directory.dispose === "function") {
			directory.dispose();
		}
	}

	private undeleteSubDirectoryTree(directory: SubDirectory): void {
		// Restore deleted subdirectory tree. Need to undispose the current directory first, then get access to the iterator.
		// This will unmark "deleted" from the subdirectories from top to bottom.
		directory.undispose();
		for (const [_, subDirectory] of directory.subdirectories()) {
			this.undeleteSubDirectoryTree(subDirectory as SubDirectory);
		}
	}
}
