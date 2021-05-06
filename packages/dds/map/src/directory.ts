/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert,TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidSerializer } from "@fluidframework/core-interfaces";
import { readAndParse } from "@fluidframework/driver-utils";
import { addBlobToTree } from "@fluidframework/protocol-base";
import {
    ISequencedDocumentMessage,
    ITree,
    MessageType,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { SharedObject, ValueType } from "@fluidframework/shared-object-base";
import * as path from "path-browserify";
import { debug } from "./debug";
import {
    IDirectory,
    IDirectoryEvents,
    IDirectoryValueChanged,
    ISerializableValue,
    ISerializedValue,
    ISharedDirectory,
    ISharedDirectoryEvents,
    IValueChanged,
} from "./interfaces";
import {
    ILocalValue,
    LocalValueMaker,
    makeSerializable,
} from "./localValues";
import { pkgVersion } from "./packageVersion";

// We use path-browserify since this code can run safely on the server or the browser.
// We standardize on using posix slashes everywhere.
const posix: typeof import("path").posix = path.posix;

const snapshotFileName = "header";

/**
 * Defines the means to process and submit a given op on a directory.
 */
interface IDirectoryMessageHandler {
    /**
     * Apply the given operation.
     * @param op - The directory operation to apply
     * @param local - Whether the message originated from the local client
     * @param message - The full message
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    process(
        op: IDirectoryOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
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
interface IDirectorySetOperation {
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
    value: ISerializableValue;
}

/**
 * Operation indicating a key should be deleted from the directory.
 */
interface IDirectoryDeleteOperation {
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
 * An operation on a specific key within a directory
 */
type IDirectoryKeyOperation = IDirectorySetOperation | IDirectoryDeleteOperation;

/**
 * Operation indicating the directory should be cleared.
 */
interface IDirectoryClearOperation {
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
 * An operation on one or more of the keys within a directory
 */
type IDirectoryStorageOperation = IDirectoryKeyOperation | IDirectoryClearOperation;

/**
 * Operation indicating a subdirectory should be created.
 */
interface IDirectoryCreateSubDirectoryOperation {
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
interface IDirectoryDeleteSubDirectoryOperation {
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
 * An operation on the subdirectories within a directory
 */
type IDirectorySubDirectoryOperation = IDirectoryCreateSubDirectoryOperation | IDirectoryDeleteSubDirectoryOperation;

/**
 * Any operation on a directory
 */
type IDirectoryOperation = IDirectoryStorageOperation | IDirectorySubDirectoryOperation;

/**
 * Defines the in-memory object structure to be used for the conversion to/from serialized.
 * @privateRemarks
 * Directly used in JSON.stringify, direct result from JSON.parse.
 */
export interface IDirectoryDataObject {
    storage?: { [key: string]: ISerializableValue };
    subdirectories?: { [subdirName: string]: IDirectoryDataObject };
}

export interface IDirectoryNewStorageFormat {
    /** @deprecated - added to prevent buggy caching. remove once all loaders past 0.35 */
    absolutePath?: string;
    blobs: string[];
    content: IDirectoryDataObject;
}

function serializeDirectory(absolutePath: string, root: SubDirectory, serializer: IFluidSerializer): ITree {
    const MinValueSizeSeparateSnapshotBlob = 8 * 1024;

    const tree: ITree = { entries: [] };
    let counter = 0;
    const blobs: string[] = [];

    const stack: [SubDirectory, IDirectoryDataObject][] = [];
    const content: IDirectoryDataObject = {};
    stack.push([root, content]);

    while (stack.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [currentSubDir, currentSubDirObject] = stack.pop()!;
        for (const [key, value] of currentSubDir.getSerializedStorage(serializer)) {
            if (!currentSubDirObject.storage) {
                currentSubDirObject.storage = {};
            }
            const result: ISerializableValue = {
                type: value.type,
                // eslint-disable-next-line @typescript-eslint/ban-types
                value: value.value && JSON.parse(value.value) as object,
            };
            if (value.value && value.value.length >= MinValueSizeSeparateSnapshotBlob) {
                const extraContent: IDirectoryDataObject = {};
                let largeContent = extraContent;
                if (currentSubDir.absolutePath !== posix.sep) {
                    for (const dir of currentSubDir.absolutePath.substr(1).split(posix.sep)) {
                        const subDataObject: IDirectoryDataObject = {};
                        largeContent.subdirectories = { [dir]: subDataObject };
                        largeContent = subDataObject;
                    }
                }
                largeContent.storage = { [key]: result };
                const blobName = `blob${counter}`;
                counter++;
                blobs.push(blobName);
                addBlobToTree(tree, blobName, extraContent);
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
        absolutePath,
        blobs,
        content,
    };
    addBlobToTree(tree, snapshotFileName, newFormat);

    return tree;
}

/**
 * The factory that defines the directory.
 * @sealed
 */
export class DirectoryFactory {
    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
     */
    public static readonly Type = "https://graph.microsoft.com/types/directory";

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
     */
    public static readonly Attributes: IChannelAttributes = {
        type: DirectoryFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
     */
    public get type() {
        return DirectoryFactory.Type;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
     */
    public get attributes() {
        return DirectoryFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedDirectory> {
        const directory = new SharedDirectory(id, runtime, attributes);
        await directory.load(services);

        return directory;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
     */
    public create(runtime: IFluidDataStoreRuntime, id: string): ISharedDirectory {
        const directory = new SharedDirectory(id, runtime, DirectoryFactory.Attributes);
        directory.initializeLocal();

        return directory;
    }
}

/**
 * SharedDirectory provides a hierarchical organization of map-like data structures as SubDirectories.
 * The values stored within can be accessed like a map, and the hierarchy can be navigated using path syntax.
 * SubDirectories can be retrieved for use as working directories.
 *
 * @example
 * ```ts
 * mySharedDirectory.createSubDirectory("a").createSubDirectory("b").createSubDirectory("c").set("foo", val1);
 * const mySubDir = mySharedDirectory.getWorkingDirectory("/a/b/c");
 * mySubDir.get("foo"); // returns val1
 * ```
 *
 * @sealed
 */
export class SharedDirectory extends SharedObject<ISharedDirectoryEvents> implements ISharedDirectory {
    /**
     * Create a new shared directory
     *
     * @param runtime - Data store runtime the new shared directory belongs to
     * @param id - Optional name of the shared directory
     * @returns Newly create shared directory (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedDirectory {
        return runtime.createChannel(id, DirectoryFactory.Type) as SharedDirectory;
    }

    /**
     * Get a factory for SharedDirectory to register with the data store.
     *
     * @returns A factory that creates and load SharedDirectory
     */
    public static getFactory(): IChannelFactory {
        return new DirectoryFactory();
    }

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
     * @internal
     */
    public readonly localValueMaker: LocalValueMaker;

    /**
     * Root of the SharedDirectory, most operations on the SharedDirectory itself act on the root.
     */
    private readonly root: SubDirectory = new SubDirectory(this, this.runtime, this.serializer, posix.sep);

    /**
     * Mapping of op types to message handlers.
     */
    private readonly messageHandlers: Map<string, IDirectoryMessageHandler> = new Map();

    /**
     * Constructs a new shared directory. If the object is non-local an id and service interfaces will
     * be provided.
     * @param id - String identifier for the SharedDirectory
     * @param runtime - Data store runtime
     * @param type - Type identifier
     */
    constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
    ) {
        super(id, runtime, attributes);
        this.localValueMaker = new LocalValueMaker(this.serializer);
        this.setMessageHandlers();
        // Mirror the containedValueChanged op on the SharedDirectory
        this.root.on(
            "containedValueChanged",
            (changed: IValueChanged, local: boolean) => {
                this.emit("containedValueChanged", changed, local, this);
            },
        );
    }

    /**
     * {@inheritDoc IDirectory.get}
     */
    public get<T = any>(key: string): T | undefined {
        return this.root.get<T>(key);
    }

    /**
     * {@inheritDoc IDirectory.wait}
     */
    public async wait<T = any>(key: string): Promise<T> {
        return this.root.wait<T>(key);
    }

    /**
     * {@inheritDoc IDirectory.set}
     */
    public set<T = any>(key: string, value: T): this {
        this.root.set(key, value);
        return this;
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
    public forEach(callback: (value: any, key: string, map: Map<string, any>) => void): void {
        this.root.forEach(callback);
    }

    /**
     * Get an iterator over the entries under this IDirectory.
     * @returns The iterator
     */
    public [Symbol.iterator](): IterableIterator<[string, any]> {
        return this.root[Symbol.iterator]();
    }

    /**
     * Get an iterator over the entries under this IDirectory.
     * @returns The iterator
     */
    public entries(): IterableIterator<[string, any]> {
        return this.root.entries();
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
        const subdirs = absolutePath.substr(1).split(posix.sep);
        for (const subdir of subdirs) {
            currentSubDir = currentSubDir.getSubDirectory(subdir) as SubDirectory;
            if (!currentSubDir) {
                return undefined;
            }
        }
        return currentSubDir;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.snapshotCore}
     */
    protected snapshotCore(serializer: IFluidSerializer): ITree {
        return serializeDirectory(this.handle.absolutePath, this.root, serializer);
    }

    /**
     * Submits an operation
     * @param op - Op to submit
     * @param localOpMetadata - The local metadata associated with the op. We send a unique id that is used to track
     * this op while it has not been ack'd. This will be sent when we receive this op back from the server.
     * @internal
     */
    public submitDirectoryMessage(op: IDirectoryOperation, localOpMetadata: unknown) {
        this.submitLocalMessage(op, localOpMetadata);
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
     */
    protected onDisconnect() {
        debug(`Directory ${this.id} is now disconnected`);
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.resubmitCore}
     */
    protected resubmitCore(content: any, localOpMetadata: unknown) {
        const message = content as IDirectoryOperation;
        const handler = this.messageHandlers.get(message.type);
        assert(handler !== undefined, 0x00d /* `Missing message handler for message type: ${message.type}` */);
        handler.submit(message, localOpMetadata);
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService) {
        const data = await readAndParse(storage, snapshotFileName);
        const newFormat = data as IDirectoryNewStorageFormat;
        if (Array.isArray(newFormat.blobs)) {
            // New storage format
            this.populate(newFormat.content);
            await Promise.all(newFormat.blobs.map(async (value) => {
                const dataExtra = await readAndParse(storage, value);
                this.populate(dataExtra as IDirectoryDataObject);
            }));
        } else {
            // Old storage format
            this.populate(data as IDirectoryDataObject);
        }
    }

    /**
     * Populate the directory with the given directory data.
     * @param data - A JSON string containing serialized directory data
     * @internal
     */
    protected populate(data: IDirectoryDataObject) {
        const stack: [SubDirectory, IDirectoryDataObject][] = [];
        stack.push([this.root, data]);
        while (stack.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [currentSubDir, currentSubDirObject] = stack.pop()!;
            if (currentSubDirObject.subdirectories) {
                for (const [subdirName, subdirObject] of Object.entries(currentSubDirObject.subdirectories)) {
                    let newSubDir = currentSubDir.getSubDirectory(subdirName) as SubDirectory;
                    if (!newSubDir) {
                        newSubDir = new SubDirectory(
                            this,
                            this.runtime,
                            this.serializer,
                            posix.join(currentSubDir.absolutePath, subdirName),
                        );
                        currentSubDir.populateSubDirectory(subdirName, newSubDir);
                    }
                    stack.push([newSubDir, subdirObject]);
                }
            }

            if (currentSubDirObject.storage) {
                for (const [key, serializable] of Object.entries(currentSubDirObject.storage)) {
                    const localValue = this.makeLocal(
                        key,
                        currentSubDir.absolutePath,
                        serializable,
                    );
                    currentSubDir.populateStorage(key, localValue);
                }
            }
        }
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.registerCore}
     */
    protected registerCore(): void {
        const subdirsToRegisterFrom = new Array<SubDirectory>();
        subdirsToRegisterFrom.push(this.root);

        for (const currentSubDir of subdirsToRegisterFrom) {
            for (const value of currentSubDir.values()) {
                if (SharedObject.is(value)) {
                    value.bindToContext();
                }
            }

            for (const [, subdir] of currentSubDir.subdirectories()) {
                subdirsToRegisterFrom.push(subdir as SubDirectory);
            }
        }
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        if (message.type === MessageType.Operation) {
            const op: IDirectoryOperation = message.contents as IDirectoryOperation;
            const handler = this.messageHandlers.get(op.type);
            assert(handler !== undefined, 0x00e /* `Missing message handler for message type: ${message.type}` */);
            handler.process(op, local, message, localOpMetadata);
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
        serializable: ISerializableValue,
    ): ILocalValue {
        assert(
            serializable.type === ValueType[ValueType.Plain] || serializable.type === ValueType[ValueType.Shared],
            "Unexpected serializable type",
        );
        return this.localValueMaker.fromSerializable(serializable);
    }

    /**
     * Set the message handlers for the directory.
     */
    private setMessageHandlers(): void {
        this.messageHandlers.set(
            "clear",
            {
                process: (op: IDirectoryClearOperation, local, message, localOpMetadata) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (subdir) {
                        subdir.processClearMessage(op, local, message, localOpMetadata);
                    }
                },
                submit: (op: IDirectoryClearOperation, localOpMetadata: unknown) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (subdir) {
                        // We don't reuse the metadata but send a new one on each submit.
                        subdir.submitClearMessage(op);
                    }
                },
            },
        );
        this.messageHandlers.set(
            "delete",
            {
                process: (op: IDirectoryDeleteOperation, local, message, localOpMetadata) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (subdir) {
                        subdir.processDeleteMessage(op, local, message, localOpMetadata);
                    }
                },
                submit: (op: IDirectoryDeleteOperation, localOpMetadata: unknown) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (subdir) {
                        // We don't reuse the metadata but send a new one on each submit.
                        subdir.submitKeyMessage(op);
                    }
                },
            },
        );
        this.messageHandlers.set(
            "set",
            {
                process: (op: IDirectorySetOperation, local, message, localOpMetadata) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (subdir) {
                        const context = local ? undefined : this.makeLocal(op.key, op.path, op.value);
                        subdir.processSetMessage(op, context, local, message, localOpMetadata);
                    }
                },
                submit: (op: IDirectorySetOperation, localOpMetadata: unknown) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (subdir) {
                        // We don't reuse the metadata but send a new one on each submit.
                        subdir.submitKeyMessage(op);
                    }
                },
            },
        );

        this.messageHandlers.set(
            "createSubDirectory",
            {
                process: (op: IDirectoryCreateSubDirectoryOperation, local, message, localOpMetadata) => {
                    const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (parentSubdir) {
                        parentSubdir.processCreateSubDirectoryMessage(op, local, message, localOpMetadata);
                    }
                },
                submit: (op: IDirectoryCreateSubDirectoryOperation, localOpMetadata: unknown) => {
                    const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (parentSubdir) {
                        // We don't reuse the metadata but send a new one on each submit.
                        parentSubdir.submitSubDirectoryMessage(op);
                    }
                },
            },
        );

        this.messageHandlers.set(
            "deleteSubDirectory",
            {
                process: (op: IDirectoryDeleteSubDirectoryOperation, local, message, localOpMetadata) => {
                    const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (parentSubdir) {
                        parentSubdir.processDeleteSubDirectoryMessage(op, local, message, localOpMetadata);
                    }
                },
                submit: (op: IDirectoryDeleteSubDirectoryOperation, localOpMetadata: unknown) => {
                    const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory | undefined;
                    if (parentSubdir) {
                        // We don't reuse the metadata but send a new one on each submit.
                        parentSubdir.submitSubDirectoryMessage(op);
                    }
                },
            },
        );
    }

    protected applyStashedOp() {
        throw new Error("not implemented");
    }
}

/**
 * Node of the directory tree.
 * @sealed
 */
class SubDirectory extends TypedEventEmitter<IDirectoryEvents> implements IDirectory {
    /**
     * String representation for the class.
     */
    public [Symbol.toStringTag]: string = "SubDirectory";

    /**
     * The in-memory data the directory is storing.
     */
    private readonly _storage: Map<string, ILocalValue> = new Map();

    /**
     * The subdirectories the directory is holding.
     */
    private readonly _subdirectories: Map<string, SubDirectory> = new Map();

    /**
     * Keys that have been modified locally but not yet ack'd from the server.
     */
    private readonly pendingKeys: Map<string, number> = new Map();

    /**
     * Subdirectories that have been modified locally but not yet ack'd from the server.
     */
    private readonly pendingSubDirectories: Map<string, number> = new Map();

    /**
     * This is used to assign a unique id to every outgoing operation and helps in tracking unack'd ops.
     */
    private pendingMessageId: number = -1;

    /**
     * If a clear has been performed locally but not yet ack'd from the server, then this stores the pending id
     * of that clear operation. Otherwise, is -1.
     */
    private pendingClearMessageId: number = -1;

    /**
     * Constructor.
     * @param directory - Reference back to the SharedDirectory to perform operations
     * @param runtime - The data store runtime this directory is associated with
     * @param serializer - The serializer to serialize / parse handles
     * @param absolutePath - The absolute path of this IDirectory
     */
    constructor(
        private readonly directory: SharedDirectory,
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly serializer: IFluidSerializer,
        public readonly absolutePath: string,
    ) {
        super();
    }

    /**
     * Checks whether the given key exists in this IDirectory.
     * @param key - The key to check
     * @returns True if the key exists, false otherwise
     */
    public has(key: string): boolean {
        return this._storage.has(key);
    }

    /**
     * {@inheritDoc IDirectory.get}
     */
    public get<T = any>(key: string): T | undefined {
        return this._storage.get(key)?.value as T | undefined;
    }

    /**
     * {@inheritDoc IDirectory.wait}
     */
    public async wait<T = any>(key: string): Promise<T> {
        // Return immediately if the value already exists
        if (this._storage.has(key)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this._storage.get(key)!.value as T;
        }

        // Otherwise subscribe to changes
        return new Promise<T>((resolve, reject) => {
            const callback = (changed: IDirectoryValueChanged) => {
                if (this.absolutePath === changed.path && key === changed.key) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    resolve(this._storage.get(key)!.value as T);
                    this.directory.removeListener("valueChanged", callback);
                }
            };

            this.directory.on("valueChanged", callback);
        });
    }

    /**
     * {@inheritDoc IDirectory.set}
     */
    public set<T = any>(key: string, value: T): this {
        // Undefined/null keys can't be serialized to JSON in the manner we currently snapshot.
        if (key === undefined || key === null) {
            throw new Error("Undefined and null keys are not supported");
        }

        // Create a local value and serialize it.
        const localValue = this.directory.localValueMaker.fromInMemory(value);
        const serializableValue = makeSerializable(
            localValue,
            this.serializer,
            this.directory.handle);

        // Set the value locally.
        this.setCore(
            key,
            localValue,
            true,
            null,
        );

        // If we are not attached, don't submit the op.
        if (!this.directory.isAttached()) {
            return this;
        }

        const op: IDirectorySetOperation = {
            key,
            path: this.absolutePath,
            type: "set",
            value: serializableValue,
        };
        this.submitKeyMessage(op);
        return this;
    }

    /**
     * {@inheritDoc IDirectory.createSubDirectory}
     */
    public createSubDirectory(subdirName: string): IDirectory {
        // Undefined/null subdirectory names can't be serialized to JSON in the manner we currently snapshot.
        if (subdirName === undefined || subdirName === null) {
            throw new Error("SubDirectory name may not be undefined or null");
        }

        if (subdirName.includes(posix.sep)) {
            throw new Error(`SubDirectory name may not contain ${posix.sep}`);
        }

        // Create the sub directory locally first.
        this.createSubDirectoryCore(subdirName, true, null);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const subDir: IDirectory = this._subdirectories.get(subdirName)!;

        // If we are not attached, don't submit the op.
        if (!this.directory.isAttached()) {
            return subDir;
        }

        const op: IDirectoryCreateSubDirectoryOperation = {
            path: this.absolutePath,
            subdirName,
            type: "createSubDirectory",
        };
        this.submitSubDirectoryMessage(op);

        return subDir;
    }

    /**
     * {@inheritDoc IDirectory.getSubDirectory}
     */
    public getSubDirectory(subdirName: string): IDirectory | undefined {
        return this._subdirectories.get(subdirName);
    }

    /**
     * {@inheritDoc IDirectory.hasSubDirectory}
     */
    public hasSubDirectory(subdirName: string): boolean {
        return this._subdirectories.has(subdirName);
    }

    /**
     * {@inheritDoc IDirectory.deleteSubDirectory}
     */
    public deleteSubDirectory(subdirName: string): boolean {
        // Delete the sub directory locally first.
        const successfullyRemoved = this.deleteSubDirectoryCore(subdirName, true, null);

        // If we are not attached, don't submit the op.
        if (!this.directory.isAttached()) {
            return successfullyRemoved;
        }

        const op: IDirectoryDeleteSubDirectoryOperation = {
            path: this.absolutePath,
            subdirName,
            type: "deleteSubDirectory",
        };

        this.submitSubDirectoryMessage(op);
        return successfullyRemoved;
    }

    /**
     * {@inheritDoc IDirectory.subdirectories}
     */
    public subdirectories(): IterableIterator<[string, IDirectory]> {
        return this._subdirectories.entries();
    }

    /**
     * {@inheritDoc IDirectory.getWorkingDirectory}
     */
    public getWorkingDirectory(relativePath: string): IDirectory | undefined {
        return this.directory.getWorkingDirectory(this.makeAbsolute(relativePath));
    }

    /**
     * Deletes the given key from within this IDirectory.
     * @param key - The key to delete
     * @returns True if the key existed and was deleted, false if it did not exist
     */
    public delete(key: string): boolean {
        // Delete the key locally first.
        const successfullyRemoved = this.deleteCore(key, true, null);

        // If we are not attached, don't submit the op.
        if (!this.directory.isAttached()) {
            return successfullyRemoved;
        }

        const op: IDirectoryDeleteOperation = {
            key,
            path: this.absolutePath,
            type: "delete",
        };

        this.submitKeyMessage(op);
        return successfullyRemoved;
    }

    /**
     * Deletes all keys from within this IDirectory.
     */
    public clear(): void {
        // Clear the data locally first.
        this.clearCore(true, null);

        // If we are not attached, don't submit the op.
        if (!this.directory.isAttached()) {
            return;
        }

        const op: IDirectoryClearOperation = {
            path: this.absolutePath,
            type: "clear",
        };
        this.submitClearMessage(op);
    }

    /**
     * Issue a callback on each entry under this IDirectory.
     * @param callback - Callback to issue
     */
    public forEach(callback: (value: any, key: string, map: Map<string, any>) => void): void {
        this._storage.forEach((localValue, key, map) => {
            callback(localValue.value, key, map);
        });
    }

    /**
     * The number of entries under this IDirectory.
     */
    public get size(): number {
        return this._storage.size;
    }

    /**
     * Get an iterator over the entries under this IDirectory.
     * @returns The iterator
     */
    public entries(): IterableIterator<[string, any]> {
        const localEntriesIterator = this._storage.entries();
        const iterator = {
            next(): IteratorResult<[string, any]> {
                const nextVal = localEntriesIterator.next();
                if (nextVal.done) {
                    return { value: undefined, done: true };
                } else {
                    // Unpack the stored value
                    return { value: [nextVal.value[0], nextVal.value[1].value], done: false };
                }
            },
            [Symbol.iterator]() {
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
        return this._storage.keys();
    }

    /**
     * Get an iterator over the values under this IDirectory.
     * @returns The iterator
     */
    public values(): IterableIterator<any> {
        const localValuesIterator = this._storage.values();
        const iterator = {
            next(): IteratorResult<any> {
                const nextVal = localValuesIterator.next();
                if (nextVal.done) {
                    return { value: undefined, done: true };
                } else {
                    // Unpack the stored value
                    return { value: nextVal.value.value, done: false };
                }
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }

    /**
     * Get an iterator over the entries under this IDirectory.
     * @returns The iterator
     */
    public [Symbol.iterator](): IterableIterator<[string, any]> {
        return this.entries();
    }

    /**
     * Process a clear operation.
     * @param op - The op to process
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @internal
     */
    public processClearMessage(
        op: IDirectoryClearOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
        localOpMetadata: unknown,
    ): void {
        if (local) {
            assert(localOpMetadata !== undefined,
                0x00f /* `pendingMessageId is missing from the local client's ${op.type} operation` */);
            const pendingMessageId = localOpMetadata as number;
            if (this.pendingClearMessageId === pendingMessageId) {
                this.pendingClearMessageId = -1;
            }
            return;
        }
        this.clearExceptPendingKeys();
        this.directory.emit("clear", local, op, this.directory);
    }

    /**
     * Process a delete operation.
     * @param op - The op to process
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @internal
     */
    public processDeleteMessage(
        op: IDirectoryDeleteOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
        localOpMetadata: unknown,
    ): void {
        if (!this.needProcessStorageOperation(op, local, message, localOpMetadata)) {
            return;
        }
        this.deleteCore(op.key, local, message);
    }

    /**
     * Process a set operation.
     * @param op - The op to process
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @internal
     */
    public processSetMessage(
        op: IDirectorySetOperation,
        context: ILocalValue | undefined,
        local: boolean,
        message: ISequencedDocumentMessage,
        localOpMetadata: unknown,
    ): void {
        if (!this.needProcessStorageOperation(op, local, message, localOpMetadata)) {
            return;
        }

        // needProcessStorageOperation should have returned false if local is true
        // so we can assume context is not undefined

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.setCore(op.key, context!, local, message);
    }

    /**
     * Process a create subdirectory operation.
     * @param op - The op to process
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @internal
     */
    public processCreateSubDirectoryMessage(
        op: IDirectoryCreateSubDirectoryOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
        localOpMetadata: unknown,
    ): void {
        if (!this.needProcessSubDirectoryOperations(op, local, message, localOpMetadata)) {
            return;
        }
        this.createSubDirectoryCore(op.subdirName, local, message);
    }

    /**
     * Process a delete subdirectory operation.
     * @param op - The op to process
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @internal
     */
    public processDeleteSubDirectoryMessage(
        op: IDirectoryDeleteSubDirectoryOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
        localOpMetadata: unknown,
    ): void {
        if (!this.needProcessSubDirectoryOperations(op, local, message, localOpMetadata)) {
            return;
        }
        this.deleteSubDirectoryCore(op.subdirName, local, message);
    }

    /**
     * Submit a clear operation.
     * @param op - The operation
     * @internal
     */
    public submitClearMessage(op: IDirectoryClearOperation): void {
        const pendingMessageId = ++this.pendingMessageId;
        this.directory.submitDirectoryMessage(op, pendingMessageId);
        this.pendingClearMessageId = pendingMessageId;
    }

    /**
     * Submit a key operation.
     * @param op - The operation
     * @internal
     */
    public submitKeyMessage(op: IDirectoryKeyOperation): void {
        const pendingMessageId = ++this.pendingMessageId;
        this.directory.submitDirectoryMessage(op, pendingMessageId);
        this.pendingKeys.set(op.key, pendingMessageId);
    }

    /**
     * Submit a subdirectory operation.
     * @param op - The operation
     * @internal
     */
    public submitSubDirectoryMessage(op: IDirectorySubDirectoryOperation): void {
        const pendingMessageId = ++this.pendingMessageId;
        this.directory.submitDirectoryMessage(op, pendingMessageId);
        this.pendingSubDirectories.set(op.subdirName, pendingMessageId);
    }

    /**
     * Get the storage of this subdirectory in a serializable format, to be used in snapshotting.
     * @param serializer - The serializer to use to serialize handles in its values.
     * @returns The JSONable string representing the storage of this subdirectory
     * @internal
     */
    public *getSerializedStorage(serializer: IFluidSerializer) {
        for (const [key, localValue] of this._storage) {
            const value = localValue.makeSerialized(serializer, this.directory.handle);
            const res: [string, ISerializedValue] = [key, value];
            yield res;
        }
    }

    /**
     * Populate a key value in this subdirectory's storage, to be used when loading from snapshot.
     * @param key - The key to populate
     * @param localValue - The local value to populate into it
     * @internal
     */
    public populateStorage(key: string, localValue: ILocalValue): void {
        this._storage.set(key, localValue);
    }

    /**
     * Populate a subdirectory into this subdirectory, to be used when loading from snapshot.
     * @param subdirName - The name of the subdirectory to add
     * @param newSubDir - The new subdirectory to add
     * @internal
     */
    public populateSubDirectory(subdirName: string, newSubDir: SubDirectory): void {
        this._subdirectories.set(subdirName, newSubDir);
    }

    /**
     * Retrieve the local value at the given key.  This is used to get value type information stashed on the local
     * value so op handlers can be retrieved
     * @param key - The key to retrieve from
     * @returns The local value
     * @internal
     */
    public getLocalValue<T extends ILocalValue = ILocalValue>(key: string): T {
        return this._storage.get(key) as T;
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
     * If our local operations that have not yet been ack'd will eventually overwrite an incoming operation, we should
     * not process the incoming operation.
     * @param op - Operation to check
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @returns True if the operation should be processed, false otherwise
     */
    private needProcessStorageOperation(
        op: IDirectoryKeyOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
        localOpMetadata: unknown,
    ): boolean {
        if (this.pendingClearMessageId !== -1) {
            if (local) {
                assert(localOpMetadata !== undefined && localOpMetadata as number < this.pendingClearMessageId,
                    0x010 /* "Received out of order storage op when there is an unackd clear message" */);
            }
            // If I have a NACK clear, we can ignore all ops.
            return false;
        }

        if (this.pendingKeys.has(op.key)) {
            // Found an NACK op, clear it from the directory if the latest sequence number in the directory
            // match the message's and don't process the op.
            if (local) {
                assert(localOpMetadata !== undefined,
                    0x011 /* `pendingMessageId is missing from the local client's ${op.type} operation` */);
                const pendingMessageId = localOpMetadata as number;
                const pendingKeyMessageId = this.pendingKeys.get(op.key);
                if (pendingKeyMessageId === pendingMessageId) {
                    this.pendingKeys.delete(op.key);
                }
            }
            return false;
        }

        // If we don't have a NACK op on the key, we need to process the remote ops.
        return !local;
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
    private needProcessSubDirectoryOperations(
        op: IDirectorySubDirectoryOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
        localOpMetadata: unknown,
    ): boolean {
        if (this.pendingSubDirectories.has(op.subdirName)) {
            if (local) {
                assert(localOpMetadata !== undefined,
                    0x012 /* `pendingMessageId is missing from the local client's ${op.type} operation` */);
                const pendingMessageId = localOpMetadata as number;
                const pendingSubDirectoryMessageId = this.pendingSubDirectories.get(op.subdirName);
                if (pendingSubDirectoryMessageId === pendingMessageId) {
                    this.pendingSubDirectories.delete(op.subdirName);
                }
            }
            return false;
        }

        return !local;
    }

    /**
     * Clear all keys in memory in response to a remote clear, but retain keys we have modified but not yet been ack'd.
     */
    private clearExceptPendingKeys() {
        // Assuming the pendingKeys is small and the map is large
        // we will get the value for the pendingKeys and clear the map
        const temp = new Map<string, ILocalValue>();
        this.pendingKeys.forEach((value, key, map) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            temp.set(key, this._storage.get(key)!);
        });
        this._storage.clear();
        temp.forEach((value, key, map) => {
            this._storage.set(key, value);
        });
    }

    /**
     * Clear implementation used for both locally sourced clears as well as incoming remote clears.
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote clear, or null if from a local clear
     */
    private clearCore(local: boolean, op: ISequencedDocumentMessage | null) {
        this._storage.clear();
        this.directory.emit("clear", local, op, this.directory);
    }

    /**
     * Delete implementation used for both locally sourced deletes as well as incoming remote deletes.
     * @param key - The key being deleted
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote delete, or null if from a local delete
     * @returns True if the key existed and was deleted, false if it did not exist
     */
    private deleteCore(key: string, local: boolean, op: ISequencedDocumentMessage | null) {
        const previousValue = this.get(key);
        const successfullyRemoved = this._storage.delete(key);
        if (successfullyRemoved) {
            const event: IDirectoryValueChanged = { key, path: this.absolutePath, previousValue };
            this.directory.emit("valueChanged", event, local, op, this.directory);
            const containedEvent: IValueChanged = { key, previousValue };
            this.emit("containedValueChanged", containedEvent, local, this);
        }
        return successfullyRemoved;
    }

    /**
     * Set implementation used for both locally sourced sets as well as incoming remote sets.
     * @param key - The key being set
     * @param value - The value being set
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote set, or null if from a local set
     */
    private setCore(key: string, value: ILocalValue, local: boolean, op: ISequencedDocumentMessage | null) {
        const previousValue = this.get(key);
        this._storage.set(key, value);
        const event: IDirectoryValueChanged = { key, path: this.absolutePath, previousValue };
        this.directory.emit("valueChanged", event, local, op, this.directory);
        const containedEvent: IValueChanged = { key, previousValue };
        this.emit("containedValueChanged", containedEvent, local, this);
    }

    /**
     * Create subdirectory implementation used for both locally sourced creation as well as incoming remote creation.
     * @param subdirName - The name of the subdirectory being created
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote create, or null if from a local create
     */
    private createSubDirectoryCore(subdirName: string, local: boolean, op: ISequencedDocumentMessage | null) {
        if (!this._subdirectories.has(subdirName)) {
            this._subdirectories.set(
                subdirName,
                new SubDirectory(
                    this.directory,
                    this.runtime,
                    this.serializer,
                    posix.join(this.absolutePath, subdirName)),
            );
        }
    }

    /**
     * Delete subdirectory implementation used for both locally sourced creation as well as incoming remote creation.
     * @param subdirName - The name of the subdirectory being deleted
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote delete, or null if from a local delete
     */
    private deleteSubDirectoryCore(subdirName: string, local: boolean, op: ISequencedDocumentMessage | null) {
        // This should make the subdirectory structure unreachable so it can be GC'd and won't appear in snapshots
        // Might want to consider cleaning out the structure more exhaustively though?
        return this._subdirectories.delete(subdirName);
    }
}
