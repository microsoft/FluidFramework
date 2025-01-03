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
import type { ILocalValue } from "./localValues.js";
import { LocalValueMaker } from "./localValues.js";

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
 * @legacy
 * @alpha
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
 * @legacy
 * @alpha
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
 * @legacy
 * @alpha
 */
export type IDirectoryKeyOperation = IDirectorySetOperation | IDirectoryDeleteOperation;

/**
 * Operation indicating the directory should be cleared.
 * @legacy
 * @alpha
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
 * @legacy
 * @alpha
 */
export type IDirectoryStorageOperation = IDirectoryKeyOperation | IDirectoryClearOperation;

/**
 * Operation indicating a subdirectory should be created.
 * @legacy
 * @alpha
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
 * @legacy
 * @alpha
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
 * @legacy
 * @alpha
 */
export type IDirectorySubDirectoryOperation =
	| IDirectoryCreateSubDirectoryOperation
	| IDirectoryDeleteSubDirectoryOperation;

/**
 * Any operation on a directory.
 * @legacy
 * @alpha
 */
export type IDirectoryOperation = IDirectoryStorageOperation | IDirectorySubDirectoryOperation;

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
 * @legacy
 * @alpha
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

	/***/
	public readonly localValueMaker: LocalValueMaker;

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
		this.localValueMaker = new LocalValueMaker();
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
	protected reSubmitCore(content: unknown, localOpMetadata: unknown): void {
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
			await Promise.all(
				newFormat.blobs.map(async (value) => {
					const dataExtra = await readAndParse(storage, value);
					this.populate(dataExtra as IDirectoryDataObject);
				}),
			);
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
				for (const [subdirName, subdirObject] of Object.entries(
					currentSubDirObject.subdirectories,
				)) {
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
					const localValue = this.makeLocal(
						key,
						currentSubDir.absolutePath,
						// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
						parseHandles(serializable, this.serializer),
					);
					currentSubDir.populateStorage(key, localValue);
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
			assert(handler !== undefined, 0x00e /* Missing message handler for message type */);
			handler.process(message, op, local, localOpMetadata);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.rollback}
	 */
	protected rollback(content: unknown, localOpMetadata: unknown): void {
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
	 * The remote ISerializableValue we're receiving (either as a result of a snapshot load or an incoming set op)
	 * will have the information we need to create a real object, but will not be the real object yet.  For example,
	 * we might know it's a map and the ID but not have the actual map or its data yet.  makeLocal's job
	 * is to convert that information into a real object for local usage.
	 * @param key - Key of element being converted
	 * @param absolutePath - Path of element being converted
	 * @param serializable - The remote information that we can convert into a real object
	 * @returns The local value that was produced
	 */
	private makeLocal(
		key: string,
		absolutePath: string,
		// eslint-disable-next-line import/no-deprecated
		serializable: ISerializableValue,
	): ILocalValue {
		assert(
			serializable.type === ValueType[ValueType.Plain] ||
				serializable.type === ValueType[ValueType.Shared],
			0x1e4 /* "Unexpected serializable type" */,
		);
		return this.localValueMaker.fromSerializable(serializable, this.serializer, this.handle);
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
		const nodeList = absolutePath.split(posix.sep);
		let start = 1;
		while (start < nodeList.length) {
			const subDirName = nodeList[start];
			if (currentParent.isSubDirectoryDeletePending(subDirName)) {
				return true;
			}
			currentParent = currentParent.getSubDirectory(subDirName) as SubDirectory;
			if (currentParent === undefined) {
				return true;
			}
			start += 1;
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
				const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				// If there is pending delete op for any subDirectory in the op.path, then don't apply the this op
				// as we are going to delete this subDirectory.
				if (subdir && !this.isSubDirectoryDeletePending(op.path)) {
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
				const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				// If there is pending delete op for any subDirectory in the op.path, then don't apply the this op
				// as we are going to delete this subDirectory.
				if (subdir && !this.isSubDirectoryDeletePending(op.path)) {
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
				const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
				// If there is pending delete op for any subDirectory in the op.path, then don't apply the this op
				// as we are going to delete this subDirectory.
				if (subdir && !this.isSubDirectoryDeletePending(op.path)) {
					const context = local ? undefined : this.makeLocal(op.key, op.path, op.value);
					subdir.processSetMessage(msg, op, context, local, localOpMetadata);
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
				// If there is pending delete op for any subDirectory in the op.path, then don't apply the this op
				// as we are going to delete this subDirectory.
				if (parentSubdir && !this.isSubDirectoryDeletePending(op.path)) {
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
				// If there is pending delete op for any subDirectory in the op.path, then don't apply the this op
				// as we are going to delete this subDirectory.
				if (parentSubdir && !this.isSubDirectoryDeletePending(op.path)) {
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
				dir?.set(
					directoryOp.key,
					this.localValueMaker.fromSerializable(
						directoryOp.value,
						this.serializer,
						this.handle,
					).value,
				);
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
	pendingMessageId: number;
	previousValue: ILocalValue | undefined;
}

interface IClearLocalOpMetadata {
	type: "clear";
	pendingMessageId: number;
	previousStorage: Map<string, ILocalValue>;
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
	return (
		metadata !== undefined &&
		typeof metadata.pendingMessageId === "number" &&
		metadata.type === "edit"
	);
}

function isClearLocalOpMetadata(metadata: any): metadata is IClearLocalOpMetadata {
	return (
		metadata !== undefined &&
		metadata.type === "clear" &&
		typeof metadata.pendingMessageId === "number" &&
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
	 * The in-memory data the directory is storing.
	 */
	private readonly _storage = new Map<string, ILocalValue>();

	/**
	 * The subdirectories the directory is holding.
	 */
	private readonly _subdirectories = new Map<string, SubDirectory>();

	/**
	 * Keys that have been modified locally but not yet ack'd from the server. This is for operations on keys like
	 * set/delete operations on keys. The value of this map is list of pendingMessageIds at which that key
	 * was modified. We don't store the type of ops, and behaviour of key ops are different from behaviour of sub
	 * directory ops, so we have separate map from subDirectories tracker.
	 */
	private readonly pendingKeys = new Map<string, number[]>();

	/**
	 * Subdirectories that have been deleted locally but not yet ack'd from the server. This maintains the record
	 * of delete op that are pending or yet to be acked from server. This is maintained just to track the locally
	 * deleted sub directory.
	 */
	private readonly pendingDeleteSubDirectoriesTracker = new Map<string, number>();

	/**
	 * Subdirectories that have been created locally but not yet ack'd from the server. This maintains the record
	 * of create op that are pending or yet to be acked from server. This is maintained just to track the locally
	 * created sub directory.
	 */
	private readonly pendingCreateSubDirectoriesTracker = new Map<string, number>();

	/**
	 * This is used to assign a unique id to every outgoing operation and helps in tracking unack'd ops.
	 */
	private pendingMessageId: number = -1;

	/**
	 * The pending ids of any clears that have been performed locally but not yet ack'd from the server
	 */
	private readonly pendingClearMessageIds: number[] = [];

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
		return this._storage.has(key);
	}

	/**
	 * {@inheritDoc IDirectory.get}
	 */
	public get<T = unknown>(key: string): T | undefined {
		this.throwIfDisposed();
		return this._storage.get(key)?.value as T | undefined;
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

		// Create a local value and serialize it.
		const localValue = this.directory.localValueMaker.fromInMemory(value);
		bindHandles(localValue, this.serializer, this.directory.handle);

		// Set the value locally.
		const previousValue = this.setCore(key, localValue, true);

		// If we are not attached, don't submit the op.
		if (!this.directory.isAttached()) {
			return this;
		}

		const op: IDirectorySetOperation = {
			key,
			path: this.absolutePath,
			type: "set",
			value: { type: localValue.type, value: localValue.value as unknown },
		};
		this.submitKeyMessage(op, previousValue);
		return this;
	}

	/**
	 * {@inheritDoc IDirectory.countSubDirectory}
	 */
	public countSubDirectory(): number {
		return this._subdirectories.size;
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

		// Create the sub directory locally first.
		const isNew = this.createSubDirectoryCore(
			subdirName,
			true,
			this.getLocalSeq(),
			this.runtime.clientId ?? "detached",
		);
		const subDir = this._subdirectories.get(subdirName);
		assert(subDir !== undefined, 0x5aa /* subdirectory should exist after creation */);

		// If we are not attached, don't submit the op.
		if (!this.directory.isAttached()) {
			return subDir;
		}

		// Only submit the op, if it is newly created.
		if (isNew) {
			const op: IDirectoryCreateSubDirectoryOperation = {
				path: this.absolutePath,
				subdirName,
				type: "createSubDirectory",
			};
			this.submitCreateSubDirectoryMessage(op);
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
		return this._subdirectories.get(subdirName);
	}

	/**
	 * {@inheritDoc IDirectory.hasSubDirectory}
	 */
	public hasSubDirectory(subdirName: string): boolean {
		this.throwIfDisposed();
		return this._subdirectories.has(subdirName);
	}

	/**
	 * {@inheritDoc IDirectory.deleteSubDirectory}
	 */
	public deleteSubDirectory(subdirName: string): boolean {
		this.throwIfDisposed();
		// Delete the sub directory locally first.
		const subDir = this.deleteSubDirectoryCore(subdirName, true);

		// If we are not attached, don't submit the op.
		if (!this.directory.isAttached()) {
			return subDir !== undefined;
		}

		// Only submit the op, if the directory existed and we deleted it.
		if (subDir !== undefined) {
			const op: IDirectoryDeleteSubDirectoryOperation = {
				path: this.absolutePath,
				subdirName,
				type: "deleteSubDirectory",
			};

			this.submitDeleteSubDirectoryMessage(op, subDir);
		}
		return subDir !== undefined;
	}

	/**
	 * {@inheritDoc IDirectory.subdirectories}
	 */
	public subdirectories(): IterableIterator<[string, IDirectory]> {
		this.throwIfDisposed();
		const ackedSubdirsInOrder = this.ackedCreationSeqTracker.keys();
		const localSubdirsInOrder = this.localCreationSeqTracker.keys(
			(key) => !this.ackedCreationSeqTracker.has(key),
		);

		const subdirNames = [...ackedSubdirsInOrder, ...localSubdirsInOrder];

		if (subdirNames.length !== this._subdirectories.size) {
			// TODO: AB#7022: Hitting this block indicates that the eventual consistency scheme for ordering subdirectories
			// has failed. Fall back to previous directory behavior, which didn't guarantee ordering.
			// It's not currently clear how to reach this state, so log some diagnostics to help understand the issue.
			// This whole block should eventually be replaced by an assert that the two sizes align.
			if (!hasLoggedDirectoryInconsistency) {
				this.logger.sendTelemetryEvent({
					eventName: "inconsistentSubdirectoryOrdering",
					localKeyCount: this.localCreationSeqTracker.size,
					ackedKeyCount: this.ackedCreationSeqTracker.size,
					subdirNamesLength: subdirNames.length,
					subdirectoriesSize: this._subdirectories.size,
				});
				hasLoggedDirectoryInconsistency = true;
			}

			return this._subdirectories.entries();
		}

		const entriesIterator = {
			index: 0,
			dirs: this._subdirectories,
			next(): IteratorResult<[string, IDirectory]> {
				if (this.index < subdirNames.length) {
					const subdirName = subdirNames[this.index++];
					const subdir = this.dirs.get(subdirName);
					assert(subdir !== undefined, 0x8ac /* Could not find expected sub-directory. */);
					return { value: [subdirName, subdir], done: false };
				}
				return { value: undefined, done: true };
			},
			[Symbol.iterator](): IterableIterator<[string, IDirectory]> {
				return this;
			},
		};

		return entriesIterator;
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
		if (this.pendingDeleteSubDirectoriesTracker.has(subDirName)) {
			return true;
		}
		return false;
	}

	/**
	 * Deletes the given key from within this IDirectory.
	 * @param key - The key to delete
	 * @returns True if the key existed and was deleted, false if it did not exist
	 */
	public delete(key: string): boolean {
		this.throwIfDisposed();
		// Delete the key locally first.
		const previousValue = this.deleteCore(key, true);

		// If we are not attached, don't submit the op.
		if (!this.directory.isAttached()) {
			return previousValue !== undefined;
		}

		const op: IDirectoryDeleteOperation = {
			key,
			path: this.absolutePath,
			type: "delete",
		};

		this.submitKeyMessage(op, previousValue);
		return previousValue !== undefined;
	}

	/**
	 * Deletes all keys from within this IDirectory.
	 */
	public clear(): void {
		this.throwIfDisposed();

		// If we are not attached, don't submit the op.
		if (!this.directory.isAttached()) {
			this.clearCore(true);
			return;
		}

		const copy = new Map<string, ILocalValue>(this._storage);
		this.clearCore(true);
		const op: IDirectoryClearOperation = {
			path: this.absolutePath,
			type: "clear",
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
		// eslint-disable-next-line unicorn/no-array-for-each
		this._storage.forEach((localValue, key, map) => {
			callback(localValue.value, key, map);
		});
	}

	/**
	 * The number of entries under this IDirectory.
	 */
	public get size(): number {
		this.throwIfDisposed();
		return this._storage.size;
	}

	/**
	 * Get an iterator over the entries under this IDirectory.
	 * @returns The iterator
	 */
	public entries(): IterableIterator<[string, unknown]> {
		this.throwIfDisposed();
		const localEntriesIterator = this._storage.entries();
		const iterator = {
			next(): IteratorResult<[string, unknown]> {
				const nextVal = localEntriesIterator.next();
				return nextVal.done
					? { value: undefined, done: true }
					: { value: [nextVal.value[0], nextVal.value[1]?.value], done: false };
			},
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
		return this._storage.keys();
	}

	/**
	 * Get an iterator over the values under this IDirectory.
	 * @returns The iterator
	 */
	public values(): IterableIterator<unknown> {
		this.throwIfDisposed();
		const localValuesIterator = this._storage.values();
		const iterator = {
			next(): IteratorResult<unknown> {
				const nextVal = localValuesIterator.next();
				return nextVal.done
					? { value: undefined, done: true }
					: { value: nextVal.value.value, done: false };
			},
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
		return this.entries();
	}

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
			assert(
				isClearLocalOpMetadata(localOpMetadata),
				0x00f /* pendingMessageId is missing from the local client's operation */,
			);
			const pendingClearMessageId = this.pendingClearMessageIds.shift();
			assert(
				pendingClearMessageId === localOpMetadata.pendingMessageId,
				0x32a /* pendingMessageId does not match */,
			);
			return;
		}
		this.clearExceptPendingKeys(false);
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
		if (
			!(
				this.isMessageForCurrentInstanceOfSubDirectory(msg) &&
				this.needProcessStorageOperation(op, local, localOpMetadata)
			)
		) {
			return;
		}
		this.deleteCore(op.key, local);
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
		context: ILocalValue | undefined,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.throwIfDisposed();
		if (
			!(
				this.isMessageForCurrentInstanceOfSubDirectory(msg) &&
				this.needProcessStorageOperation(op, local, localOpMetadata)
			)
		) {
			return;
		}

		// needProcessStorageOperation should have returned false if local is true
		// so we can assume context is not undefined
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.setCore(op.key, context!, local);
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
		if (
			!(
				this.isMessageForCurrentInstanceOfSubDirectory(msg) &&
				this.needProcessSubDirectoryOperation(msg, op, local, localOpMetadata)
			)
		) {
			return;
		}
		assertNonNullClientId(msg.clientId);
		this.createSubDirectoryCore(
			op.subdirName,
			local,
			{ seq: msg.sequenceNumber, clientSeq: msg.clientSequenceNumber },
			msg.clientId,
		);
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
		if (
			!(
				this.isMessageForCurrentInstanceOfSubDirectory(msg) &&
				this.needProcessSubDirectoryOperation(msg, op, local, localOpMetadata)
			)
		) {
			return;
		}
		this.deleteSubDirectoryCore(op.subdirName, local);
	}

	/**
	 * Submit a clear operation.
	 * @param op - The operation
	 */
	private submitClearMessage(
		op: IDirectoryClearOperation,
		previousValue: Map<string, ILocalValue>,
	): void {
		this.throwIfDisposed();
		const pendingMsgId = ++this.pendingMessageId;
		this.pendingClearMessageIds.push(pendingMsgId);
		const metadata: IClearLocalOpMetadata = {
			type: "clear",
			pendingMessageId: pendingMsgId,
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
		// We don't reuse the metadata pendingMessageId but send a new one on each submit.
		const pendingClearMessageId = this.pendingClearMessageIds.shift();
		// Only submit the op, if we have record for it, otherwise it is possible that the older instance
		// is already deleted, in which case we don't need to submit the op.
		if (pendingClearMessageId === localOpMetadata.pendingMessageId) {
			this.submitClearMessage(op, localOpMetadata.previousStorage);
		}
	}

	/**
	 * Get a new pending message id for the op and cache it to track the pending op
	 */
	private getKeyMessageId(op: IDirectoryKeyOperation): number {
		// We don't reuse the metadata pendingMessageId but send a new one on each submit.
		const pendingMessageId = ++this.pendingMessageId;
		const pendingMessageIds = this.pendingKeys.get(op.key);
		if (pendingMessageIds === undefined) {
			this.pendingKeys.set(op.key, [pendingMessageId]);
		} else {
			pendingMessageIds.push(pendingMessageId);
		}
		return pendingMessageId;
	}

	/**
	 * Submit a key operation.
	 * @param op - The operation
	 * @param previousValue - The value of the key before this op
	 */
	private submitKeyMessage(op: IDirectoryKeyOperation, previousValue?: ILocalValue): void {
		this.throwIfDisposed();
		const pendingMessageId = this.getKeyMessageId(op);
		const localMetadata = { type: "edit", pendingMessageId, previousValue };
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

		// clear the old pending message id
		const pendingMessageIds = this.pendingKeys.get(op.key);
		// Only submit the op, if we have record for it, otherwise it is possible that the older instance
		// is already deleted, in which case we don't need to submit the op.
		if (pendingMessageIds !== undefined) {
			const index = pendingMessageIds.indexOf(localOpMetadata.pendingMessageId);
			if (index === -1) {
				return;
			}
			pendingMessageIds.splice(index, 1);
			if (pendingMessageIds.length === 0) {
				this.pendingKeys.delete(op.key);
			}
			this.submitKeyMessage(op, localOpMetadata.previousValue);
		}
	}

	private incrementPendingSubDirCount(map: Map<string, number>, subDirName: string): void {
		const count = map.get(subDirName) ?? 0;
		map.set(subDirName, count + 1);
	}

	private decrementPendingSubDirCount(map: Map<string, number>, subDirName: string): void {
		const count = map.get(subDirName) ?? 0;
		map.set(subDirName, count - 1);
		if (count <= 1) {
			map.delete(subDirName);
		}
	}

	/**
	 * Update the count for pending create/delete of the sub directory so that it can be validated on receiving op
	 * or while resubmitting the op.
	 */
	private updatePendingSubDirMessageCount(op: IDirectorySubDirectoryOperation): void {
		if (op.type === "deleteSubDirectory") {
			this.incrementPendingSubDirCount(this.pendingDeleteSubDirectoriesTracker, op.subdirName);
		} else if (op.type === "createSubDirectory") {
			this.incrementPendingSubDirCount(this.pendingCreateSubDirectoriesTracker, op.subdirName);
		}
	}

	/**
	 * Submit a create subdirectory operation.
	 * @param op - The operation
	 */
	private submitCreateSubDirectoryMessage(op: IDirectorySubDirectoryOperation): void {
		this.throwIfDisposed();
		this.updatePendingSubDirMessageCount(op);

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
		this.updatePendingSubDirMessageCount(op);

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

		// Only submit the op, if we have record for it, otherwise it is possible that the older instance
		// is already deleted, in which case we don't need to submit the op.
		if (
			localOpMetadata.type === "createSubDir" &&
			!this.pendingCreateSubDirectoriesTracker.has(op.subdirName)
		) {
			return;
		} else if (
			localOpMetadata.type === "deleteSubDir" &&
			!this.pendingDeleteSubDirectoriesTracker.has(op.subdirName)
		) {
			return;
		}

		if (localOpMetadata.type === "createSubDir") {
			this.decrementPendingSubDirCount(this.pendingCreateSubDirectoriesTracker, op.subdirName);
			this.submitCreateSubDirectoryMessage(op);
		} else {
			this.decrementPendingSubDirCount(this.pendingDeleteSubDirectoriesTracker, op.subdirName);
			this.submitDeleteSubDirectoryMessage(op, localOpMetadata.subDirectory);
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
		for (const [key, localValue] of this._storage) {
			const value = localValue.makeSerialized(serializer, this.directory.handle);
			const res: [string, ISerializedValue] = [key, value];
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
	public populateStorage(key: string, localValue: ILocalValue): void {
		this.throwIfDisposed();
		this._storage.set(key, localValue);
	}

	/**
	 * Populate a subdirectory into this subdirectory, to be used when loading from snapshot.
	 * @param subdirName - The name of the subdirectory to add
	 * @param newSubDir - The new subdirectory to add
	 */
	public populateSubDirectory(subdirName: string, newSubDir: SubDirectory): void {
		this.throwIfDisposed();
		this._subdirectories.set(subdirName, newSubDir);
	}

	/**
	 * Retrieve the local value at the given key.  This is used to get value type information stashed on the local
	 * value so op handlers can be retrieved
	 * @param key - The key to retrieve from
	 * @returns The local value
	 */
	public getLocalValue<T extends ILocalValue = ILocalValue>(key: string): T {
		this.throwIfDisposed();
		return this._storage.get(key) as T;
	}

	/**
	 * Remove the pendingMessageId from the map tracking it on rollback
	 * @param map - map tracking the pending messages
	 * @param key - key of the edit in the op
	 */
	private rollbackPendingMessageId(
		map: Map<string, number[]>,
		key: string,
		pendingMessageId,
	): void {
		const pendingMessageIds = map.get(key);
		const lastPendingMessageId = pendingMessageIds?.pop();
		if (!pendingMessageIds || lastPendingMessageId !== pendingMessageId) {
			throw new Error("Rollback op does not match last pending");
		}
		if (pendingMessageIds.length === 0) {
			map.delete(key);
		}
	}

	/* eslint-disable @typescript-eslint/no-unsafe-member-access */

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

		if (op.type === "clear" && localOpMetadata.type === "clear") {
			for (const [key, localValue] of localOpMetadata.previousStorage.entries()) {
				this.setCore(key, localValue, true);
			}

			const lastPendingClearId = this.pendingClearMessageIds.pop();
			if (
				lastPendingClearId === undefined ||
				lastPendingClearId !== localOpMetadata.pendingMessageId
			) {
				throw new Error("Rollback op does match last clear");
			}
		} else if (
			(op.type === "delete" || op.type === "set") &&
			localOpMetadata.type === "edit"
		) {
			const key: unknown = op.key;
			assert(key !== undefined, 0x8ad /* "key" property is missing from edit operation. */);
			assert(
				typeof key === "string",
				0x8ae /* "key" property in edit operation is misconfigured. Expected a string. */,
			);

			if (localOpMetadata.previousValue === undefined) {
				this.deleteCore(key, true);
			} else {
				this.setCore(key, localOpMetadata.previousValue, true);
			}

			this.rollbackPendingMessageId(this.pendingKeys, key, localOpMetadata.pendingMessageId);
		} else if (op.type === "createSubDirectory" && localOpMetadata.type === "createSubDir") {
			const subdirName: unknown = op.subdirName;
			assert(
				subdirName !== undefined,
				0x8af /* "subdirName" property is missing from "createSubDirectory" operation. */,
			);
			assert(
				typeof subdirName === "string",
				0x8b0 /* "subdirName" property in "createSubDirectory" operation is misconfigured. Expected a string. */,
			);

			this.deleteSubDirectoryCore(subdirName, true);
			this.decrementPendingSubDirCount(this.pendingCreateSubDirectoriesTracker, subdirName);
		} else if (op.type === "deleteSubDirectory" && localOpMetadata.type === "deleteSubDir") {
			const subdirName: unknown = op.subdirName;
			assert(
				subdirName !== undefined,
				0x8b1 /* "subdirName" property is missing from "deleteSubDirectory" operation. */,
			);
			assert(
				typeof subdirName === "string",
				0x8b2 /* "subdirName" property in "deleteSubDirectory" operation is misconfigured. Expected a string. */,
			);

			if (localOpMetadata.subDirectory !== undefined) {
				this.undeleteSubDirectoryTree(localOpMetadata.subDirectory);
				// don't need to register events because deleting never unregistered
				this._subdirectories.set(subdirName, localOpMetadata.subDirectory);
				// Restore the record in creation tracker
				if (isAcknowledgedOrDetached(localOpMetadata.subDirectory.seqData)) {
					this.ackedCreationSeqTracker.set(subdirName, {
						...localOpMetadata.subDirectory.seqData,
					});
				} else {
					this.localCreationSeqTracker.set(subdirName, {
						...localOpMetadata.subDirectory.seqData,
					});
				}
				this.emit("subDirectoryCreated", subdirName, true, this);
			}

			this.decrementPendingSubDirCount(this.pendingDeleteSubDirectoriesTracker, subdirName);
		} else {
			throw new Error("Unsupported op for rollback");
		}
	}

	/* eslint-enable @typescript-eslint/no-unsafe-member-access */

	/**
	 * Converts the given relative path into an absolute path.
	 * @param path - Relative path to convert
	 * @returns The equivalent absolute path
	 */
	private makeAbsolute(relativePath: string): string {
		return posix.resolve(this.absolutePath, relativePath);
	}

	/**
	 * If our local operations that have not yet been ack'd will eventually overwrite an incoming operation, we should
	 * not process the incoming operation.
	 * @param op - Operation to check
	 * @param local - Whether the operation originated from the local client
	 * @param localOpMetadata - For local client ops, this is the metadata that was submitted with the op.
	 * For ops from a remote client, this will be undefined.
	 * @returns True if the operation should be processed, false otherwise
	 */
	private needProcessStorageOperation(
		op: IDirectoryKeyOperation,
		local: boolean,
		localOpMetadata: unknown,
	): boolean {
		if (this.pendingClearMessageIds.length > 0) {
			if (local) {
				assert(
					localOpMetadata !== undefined &&
						isKeyEditLocalOpMetadata(localOpMetadata) &&
						localOpMetadata.pendingMessageId < this.pendingClearMessageIds[0],
					0x010 /* "Received out of order storage op when there is an unackd clear message" */,
				);
				// Remove all pendingMessageIds lower than first pendingClearMessageId.
				const lowestPendingClearMessageId = this.pendingClearMessageIds[0];
				const pendingKeyMessageIdArray = this.pendingKeys.get(op.key);
				if (pendingKeyMessageIdArray !== undefined) {
					let index = 0;
					while (pendingKeyMessageIdArray[index] < lowestPendingClearMessageId) {
						index += 1;
					}
					const newPendingKeyMessageId = pendingKeyMessageIdArray.splice(index);
					if (newPendingKeyMessageId.length === 0) {
						this.pendingKeys.delete(op.key);
					} else {
						this.pendingKeys.set(op.key, newPendingKeyMessageId);
					}
				}
			}

			// If I have a NACK clear, we can ignore all ops.
			return false;
		}

		const pendingKeyMessageIds = this.pendingKeys.get(op.key);
		if (pendingKeyMessageIds !== undefined) {
			// Found an NACK op, clear it from the directory if the latest sequence number in the directory
			// match the message's and don't process the op.
			if (local) {
				assert(
					localOpMetadata !== undefined && isKeyEditLocalOpMetadata(localOpMetadata),
					0x011 /* pendingMessageId is missing from the local client's operation */,
				);
				if (pendingKeyMessageIds[0] !== localOpMetadata.pendingMessageId) {
					// TODO: AB#7742: Hitting this block indicates that the pending message Id received
					// is not consistent with the "next" local op
					this.logger.sendTelemetryEvent({
						eventName: "unexpectedPendingMessage",
						expectedPendingMessage: pendingKeyMessageIds[0],
						actualPendingMessage: localOpMetadata.pendingMessageId,
						expectedPendingMessagesLength: pendingKeyMessageIds.length,
					});
				}
				pendingKeyMessageIds.shift();
				if (pendingKeyMessageIds.length === 0) {
					this.pendingKeys.delete(op.key);
				}
			}
			return false;
		}

		// If we don't have a NACK op on the key, we need to process the remote ops.
		return !local;
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
			(this.seqData.seq !== -1 && this.seqData.seq <= msg.referenceSequenceNumber)
		);
	}

	/**
	 * If our local operations that have not yet been ack'd will eventually overwrite an incoming operation, we should
	 * not process the incoming operation.
	 * @param op - Operation to check
	 * @param local - Whether the message originated from the local client
	 * @param message - The message
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 * @returns True if the operation should be processed, false otherwise
	 */
	private needProcessSubDirectoryOperation(
		msg: ISequencedDocumentMessage,
		op: IDirectorySubDirectoryOperation,
		local: boolean,
		localOpMetadata: unknown,
	): boolean {
		assertNonNullClientId(msg.clientId);
		const pendingDeleteCount = this.pendingDeleteSubDirectoriesTracker.get(op.subdirName);
		const pendingCreateCount = this.pendingCreateSubDirectoriesTracker.get(op.subdirName);
		if (
			(pendingDeleteCount !== undefined && pendingDeleteCount > 0) ||
			(pendingCreateCount !== undefined && pendingCreateCount > 0)
		) {
			if (local) {
				assert(
					isSubDirLocalOpMetadata(localOpMetadata),
					0x012 /* pendingMessageId is missing from the local client's operation */,
				);
				if (localOpMetadata.type === "deleteSubDir") {
					assert(
						pendingDeleteCount !== undefined && pendingDeleteCount > 0,
						0x6c2 /* pendingDeleteCount should exist */,
					);
					this.decrementPendingSubDirCount(
						this.pendingDeleteSubDirectoriesTracker,
						op.subdirName,
					);
				} else if (localOpMetadata.type === "createSubDir") {
					assert(
						pendingCreateCount !== undefined && pendingCreateCount > 0,
						0x6c3 /* pendingCreateCount should exist */,
					);
					this.decrementPendingSubDirCount(
						this.pendingCreateSubDirectoriesTracker,
						op.subdirName,
					);
				}
			}
			if (op.type === "deleteSubDirectory") {
				const resetSubDirectoryTree = (directory: SubDirectory | undefined): void => {
					if (!directory) {
						return;
					}
					// If this is delete op and we have keys in this subDirectory, then we need to delete these
					// keys except the pending ones as they will be sequenced after this delete.
					directory.clearExceptPendingKeys(local);
					// In case of delete op, we need to reset the creation seqNum, clientSeqNum and client ids of
					// creators as the previous directory is getting deleted and we will initialize again when
					// we will receive op for the create again.
					directory.seqData.seq = -1;
					directory.seqData.clientSeq = -1;
					directory.clientIds.clear();
					// Do the same thing for the subtree of the directory. If create is not pending for a child, then just
					// delete it.
					const subDirectories = directory.subdirectories();
					for (const [subDirName, subDir] of subDirectories) {
						if (directory.pendingCreateSubDirectoriesTracker.has(subDirName)) {
							resetSubDirectoryTree(subDir as SubDirectory);
							continue;
						}
						directory.deleteSubDirectoryCore(subDirName, false);
					}
				};
				const subDirectory = this._subdirectories.get(op.subdirName);
				// Clear the creation tracker record
				this.ackedCreationSeqTracker.delete(op.subdirName);
				resetSubDirectoryTree(subDirectory);
			}
			if (op.type === "createSubDirectory") {
				const dir = this._subdirectories.get(op.subdirName);
				// Child sub directory create seq number can't be lower than the parent subdirectory.
				// The sequence number for multiple ops can be the same when multiple createSubDirectory occurs with grouped batching enabled, thus <= and not just <.
				if (this.seqData.seq !== -1 && this.seqData.seq <= msg.sequenceNumber) {
					if (dir?.seqData.seq === -1) {
						// Only set the sequence data based on the first message
						dir.seqData.seq = msg.sequenceNumber;
						dir.seqData.clientSeq = msg.clientSequenceNumber;

						// set the creation seq in tracker
						if (
							!this.ackedCreationSeqTracker.has(op.subdirName) &&
							!this.pendingDeleteSubDirectoriesTracker.has(op.subdirName)
						) {
							this.ackedCreationSeqTracker.set(op.subdirName, {
								seq: msg.sequenceNumber,
								clientSeq: msg.clientSequenceNumber,
							});
							if (local) {
								this.localCreationSeqTracker.delete(op.subdirName);
							}
						}
					}
					// The client created the dir at or after the dirs seq, so list its client id as a creator.
					if (
						dir !== undefined &&
						!dir.clientIds.has(msg.clientId) &&
						dir.seqData.seq <= msg.sequenceNumber
					) {
						dir.clientIds.add(msg.clientId);
					}
				}
			}
			return false;
		}

		return !local;
	}

	/**
	 * Clear all keys in memory in response to a remote clear, but retain keys we have modified but not yet been ack'd.
	 */
	private clearExceptPendingKeys(local: boolean): void {
		// Assuming the pendingKeys is small and the map is large
		// we will get the value for the pendingKeys and clear the map
		const temp = new Map<string, ILocalValue>();

		for (const [key] of this.pendingKeys) {
			const value = this._storage.get(key);
			// If this key is already deleted, then we don't need to add it again.
			if (value !== undefined) {
				temp.set(key, value);
			}
		}

		this.clearCore(local);

		for (const [key, value] of temp.entries()) {
			this.setCore(key, value, true);
		}
	}

	/**
	 * Clear implementation used for both locally sourced clears as well as incoming remote clears.
	 * @param local - Whether the message originated from the local client
	 */
	private clearCore(local: boolean): void {
		this._storage.clear();
		this.directory.emit("clear", local, this.directory);
	}

	/**
	 * Delete implementation used for both locally sourced deletes as well as incoming remote deletes.
	 * @param key - The key being deleted
	 * @param local - Whether the message originated from the local client
	 * @returns Previous local value of the key if it existed, undefined if it did not exist
	 */
	private deleteCore(key: string, local: boolean): ILocalValue | undefined {
		const previousLocalValue = this._storage.get(key);
		const previousValue: unknown = previousLocalValue?.value;
		const successfullyRemoved = this._storage.delete(key);
		if (successfullyRemoved) {
			const event: IDirectoryValueChanged = { key, path: this.absolutePath, previousValue };
			this.directory.emit("valueChanged", event, local, this.directory);
			const containedEvent: IValueChanged = { key, previousValue };
			this.emit("containedValueChanged", containedEvent, local, this);
		}
		return previousLocalValue;
	}

	/**
	 * Set implementation used for both locally sourced sets as well as incoming remote sets.
	 * @param key - The key being set
	 * @param value - The value being set
	 * @param local - Whether the message originated from the local client
	 * @returns Previous local value of the key, if any
	 */
	private setCore(key: string, value: ILocalValue, local: boolean): ILocalValue | undefined {
		const previousLocalValue = this._storage.get(key);
		const previousValue: unknown = previousLocalValue?.value;
		this._storage.set(key, value);
		const event: IDirectoryValueChanged = { key, path: this.absolutePath, previousValue };
		this.directory.emit("valueChanged", event, local, this.directory);
		const containedEvent: IValueChanged = { key, previousValue };
		this.emit("containedValueChanged", containedEvent, local, this);
		return previousLocalValue;
	}

	/**
	 * Create subdirectory implementation used for both locally sourced creation as well as incoming remote creation.
	 * @param subdirName - The name of the subdirectory being created
	 * @param local - Whether the message originated from the local client
	 * @param seqData - Sequence number and client sequence number at which this directory is created
	 * @param clientId - Id of client which created this directory.
	 * @returns True if is newly created, false if it already existed.
	 */
	private createSubDirectoryCore(
		subdirName: string,
		local: boolean,
		seqData: SequenceData,
		clientId: string,
	): boolean {
		const subdir = this._subdirectories.get(subdirName);
		if (subdir === undefined) {
			const absolutePath = posix.join(this.absolutePath, subdirName);
			const subDir = new SubDirectory(
				{ ...seqData },
				new Set([clientId]),
				this.directory,
				this.runtime,
				this.serializer,
				absolutePath,
				this.logger,
			);
			/**
			 * Store the sequnce numbers of newly created subdirectory to the proper creation tracker, based
			 * on whether the creation behavior has been ack'd or not
			 */
			if (isAcknowledgedOrDetached(seqData)) {
				this.ackedCreationSeqTracker.set(subdirName, { ...seqData });
			} else {
				this.localCreationSeqTracker.set(subdirName, { ...seqData });
			}

			this.registerEventsOnSubDirectory(subDir, subdirName);
			this._subdirectories.set(subdirName, subDir);
			this.emit("subDirectoryCreated", subdirName, local, this);
			return true;
		} else {
			subdir.clientIds.add(clientId);
		}
		return false;
	}

	private registerEventsOnSubDirectory(subDirectory: SubDirectory, subDirName: string): void {
		subDirectory.on("subDirectoryCreated", (relativePath: string, local: boolean) => {
			this.emit("subDirectoryCreated", posix.join(subDirName, relativePath), local, this);
		});
		subDirectory.on("subDirectoryDeleted", (relativePath: string, local: boolean) => {
			this.emit("subDirectoryDeleted", posix.join(subDirName, relativePath), local, this);
		});
	}

	/**
	 * Delete subdirectory implementation used for both locally sourced creation as well as incoming remote creation.
	 * @param subdirName - The name of the subdirectory being deleted
	 * @param local - Whether the message originated from the local client
	 */
	private deleteSubDirectoryCore(
		subdirName: string,
		local: boolean,
	): SubDirectory | undefined {
		const previousValue = this._subdirectories.get(subdirName);
		// This should make the subdirectory structure unreachable so it can be GC'd and won't appear in snapshots
		// Might want to consider cleaning out the structure more exhaustively though? But not when rollback.
		if (previousValue !== undefined) {
			this._subdirectories.delete(subdirName);
			/**
			 * Remove the corresponding record from the proper creation tracker, based on whether the subdirectory has been
			 * ack'd already or still not committed yet (could be both).
			 */
			if (this.ackedCreationSeqTracker.has(subdirName)) {
				this.ackedCreationSeqTracker.delete(subdirName);
			}
			if (this.localCreationSeqTracker.has(subdirName)) {
				this.localCreationSeqTracker.delete(subdirName);
			}
			this.disposeSubDirectoryTree(previousValue);
			this.emit("subDirectoryDeleted", subdirName, local, this);
		}
		return previousValue;
	}

	private disposeSubDirectoryTree(directory: IDirectory | undefined): void {
		if (!directory) {
			return;
		}
		// Dispose the subdirectory tree. This will dispose the subdirectories from bottom to top.
		const subDirectories = directory.subdirectories();
		for (const [_, subDirectory] of subDirectories) {
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
