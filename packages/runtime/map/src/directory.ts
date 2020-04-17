/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as path from "path";
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import { addBlobToTree } from "@microsoft/fluid-protocol-base";
import {
    ISequencedDocumentMessage,
    ITree,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import {
    IChannelAttributes,
    IComponentRuntime,
    IObjectStorageService,
    ISharedObjectServices,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory, SharedObject, ValueType } from "@microsoft/fluid-shared-object-base";
import { debug } from "./debug";
import {
    IDirectory,
    IDirectoryValueChanged,
    ISerializableValue,
    ISerializedValue,
    ISharedDirectory,
    IValueOpEmitter,
    IValueTypeOperationValue,
    ISharedDirectoryEvents,
} from "./interfaces";
import {
    ILocalValue,
    LocalValueMaker,
    makeSerializable,
    ValueTypeLocalValue,
    valueTypes,
} from "./localValues";
import { pkgVersion } from "./packageVersion";

// path-browserify only supports posix functionality but doesn't have a path.posix to enforce it.  But we need to
// enforce posix when using the normal node module on Windows (otherwise it will use path.win32).  Also including an
// assert here to help protect in case path-browserify changes in the future, because we only want posix path
// functionality.
const posix = path.posix || path;
assert(posix.sep === "/");
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
     */
    process(
        op: IDirectoryOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void;

    /**
     * Communicate the operation to remote clients.
     * @param op - The directory operation to submit
     */
    submit(op: IDirectoryOperation): void;
}

/**
 * Describes an operation specific to a value type.
 */
interface IDirectoryValueTypeOperation {
    /**
     * String identifier of the operation type.
     */
    type: "act";

    /**
     * Directory key being modified.
     */
    key: string;

    /**
     * Absolute path of the directory where the modified key is located.
     */
    path: string;

    /**
     * Value of the operation, specific to the value type.
     */
    value: IValueTypeOperationValue;
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
type IDirectoryKeyOperation = IDirectoryValueTypeOperation | IDirectorySetOperation | IDirectoryDeleteOperation;

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
    blobs: string[];
    content: IDirectoryDataObject;
}

function serializeDirectory(root: SubDirectory): ITree {
    const MinValueSizeSeparateSnapshotBlob = 8 * 1024;

    const tree: ITree = { entries: [], id: null };
    let counter = 0;
    const blobs: string[] = [];

    const stack: [SubDirectory, IDirectoryDataObject][] = [];
    const content: IDirectoryDataObject = {};
    stack.push([root, content]);

    while (stack.length > 0) {
        const [currentSubDir, currentSubDirObject] = stack.pop();
        for (const [key, value] of currentSubDir.getSerializedStorage()) {
            if (!currentSubDirObject.storage) {
                currentSubDirObject.storage = {};
            }
            const result: ISerializableValue = {
                type: value.type,
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
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
     */
    public static readonly Type = "https://graph.microsoft.com/types/directory";

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
     */
    public static readonly Attributes: IChannelAttributes = {
        type: DirectoryFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
     */
    public get type() {
        return DirectoryFactory.Type;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
     */
    public get attributes() {
        return DirectoryFactory.Attributes;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.load}
     */
    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedDirectory> {
        const directory = new SharedDirectory(id, runtime, attributes);
        await directory.load(branchId, services);

        return directory;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.create}
     */
    public create(runtime: IComponentRuntime, id: string): ISharedDirectory {
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
     * @param runtime - Component runtime the new shared directory belongs to
     * @param id - Optional name of the shared directory
     * @returns Newly create shared directory (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string): SharedDirectory {
        return runtime.createChannel(id, DirectoryFactory.Type) as SharedDirectory;
    }

    /**
     * Get a factory for SharedDirectory to register with the component.
     *
     * @returns A factory that creates and load SharedDirectory
     */
    public static getFactory(): ISharedObjectFactory {
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
    private readonly root: SubDirectory = new SubDirectory(this, this.runtime, posix.sep);

    /**
     * Mapping of op types to message handlers.
     */
    private readonly messageHandlers: Map<string, IDirectoryMessageHandler> = new Map();

    /**
     * Constructs a new shared directory. If the object is non-local an id and service interfaces will
     * be provided.
     * @param id - String identifier for the SharedDirectory
     * @param runtime - Component runtime
     * @param type - Type identifier
     */
    constructor(
        id: string,
        runtime: IComponentRuntime,
        attributes: IChannelAttributes,
    ) {
        super(id, runtime, attributes);
        this.localValueMaker = new LocalValueMaker(runtime);
        this.setMessageHandlers();
        for (const type of valueTypes) {
            this.localValueMaker.registerValueType(type);
        }
    }

    /**
     * {@inheritDoc IDirectory.get}
     */
    public get<T = any>(key: string): T {
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
     * {@inheritDoc IValueTypeCreator.createValueType}
     */
    public createValueType(key: string, type: string, params: any): this {
        this.root.createValueType(key, type, params);
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
    public getSubDirectory(subdirName: string): IDirectory {
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
    public getWorkingDirectory(relativePath: string): IDirectory {
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
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.snapshot}
     */
    public snapshot(): ITree {
        return serializeDirectory(this.root);
    }

    /**
     * Submits an operation
     * @param op - Op to submit
     * @returns The client sequence number
     * @internal
     */
    public submitDirectoryMessage(op: IDirectoryOperation): number {
        return this.submitLocalMessage(op);
    }

    /**
     * Create an emitter for a value type to emit ops from the given key and path.
     * @param key - The key of the directory that the value type will be stored on
     * @param absolutePath - The absolute path of the subdirectory storing the value type
     * @returns A value op emitter for the given key and path
     * @internal
     */
    public makeDirectoryValueOpEmitter(
        key: string,
        absolutePath: string,
    ): IValueOpEmitter {
        const emit = (opName: string, previousValue: any, params: any) => {
            const op: IDirectoryValueTypeOperation = {
                key,
                path: absolutePath,
                type: "act",
                value: {
                    opName,
                    value: params,
                },
            };

            this.submitDirectoryMessage(op);
            const event: IDirectoryValueChanged = { key, path: absolutePath, previousValue };
            this.emit("valueChanged", event, true, null);
        };
        return { emit };
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onDisconnect}
     */
    protected onDisconnect() {
        debug(`Directory ${this.id} is now disconnected`);
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onConnect}
     */
    protected onConnect(pending: any[]) {
        debug(`Directory ${this.id} is now connected`);

        // Deal with the directory messages - for the directory it's always last one wins so we just resend
        for (const message of pending as IDirectoryOperation[]) {
            const handler = this.messageHandlers.get(message.type);
            handler.submit(message);
        }
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService) {
        const header = await storage.read(snapshotFileName);
        const data = JSON.parse(fromBase64ToUtf8(header));
        const newFormat = data as IDirectoryNewStorageFormat;
        if (Array.isArray(newFormat.blobs)) {
            // New storage format
            this.populate(newFormat.content);
            await Promise.all(newFormat.blobs.map(async (blob) => {
                const blobContent = await storage.read(blob);
                const dataExtra = JSON.parse(fromBase64ToUtf8(blobContent));
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
            const [currentSubDir, currentSubDirObject] = stack.pop();
            if (currentSubDirObject.subdirectories) {
                for (const [subdirName, subdirObject] of Object.entries(currentSubDirObject.subdirectories)) {
                    let newSubDir = currentSubDir.getSubDirectory(subdirName) as SubDirectory;
                    if (!newSubDir) {
                        newSubDir = new SubDirectory(
                            this,
                            this.runtime,
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
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.registerCore}
     */
    protected registerCore(): void {
        const subdirsToRegisterFrom = new Array<SubDirectory>();
        subdirsToRegisterFrom.push(this.root);

        for (const currentSubDir of subdirsToRegisterFrom) {
            for (const value of currentSubDir.values()) {
                if (SharedObject.is(value)) {
                    value.register();
                }
            }

            for (const [, subdir] of currentSubDir.subdirectories()) {
                subdirsToRegisterFrom.push(subdir as SubDirectory);
            }
        }
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.processCore}
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean): void {
        if (message.type === MessageType.Operation) {
            const op: IDirectoryOperation = message.contents as IDirectoryOperation;
            if (this.messageHandlers.has(op.type)) {
                this.messageHandlers.get(op.type)
                    .process(op, local, message);
            }
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
        if (serializable.type === ValueType[ValueType.Plain] || serializable.type === ValueType[ValueType.Shared]) {
            return this.localValueMaker.fromSerializable(serializable);
        } else {
            return this.localValueMaker.fromSerializable(
                serializable,
                this.makeDirectoryValueOpEmitter(key, absolutePath),
            );
        }
    }

    /**
     * Set the message handlers for the directory.
     */
    private setMessageHandlers(): void {
        this.messageHandlers.set(
            "clear",
            {
                process: (op: IDirectoryClearOperation, local, message) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (subdir) {
                        subdir.processClearMessage(op, local, message);
                    }
                },
                submit: (op: IDirectoryClearOperation) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (subdir) {
                        subdir.submitClearMessage(op);
                    }
                },
            },
        );
        this.messageHandlers.set(
            "delete",
            {
                process: (op: IDirectoryDeleteOperation, local, message) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (subdir) {
                        subdir.processDeleteMessage(op, local, message);
                    }
                },
                submit: (op: IDirectoryDeleteOperation) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (subdir) {
                        subdir.submitKeyMessage(op);
                    }
                },
            },
        );
        this.messageHandlers.set(
            "set",
            {
                process: (op: IDirectorySetOperation, local, message) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (subdir) {
                        const context = local ? undefined : this.makeLocal(op.key, op.path, op.value);
                        subdir.processSetMessage(op, context, local, message);
                    }
                },
                submit: (op: IDirectorySetOperation) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (subdir) {
                        subdir.submitKeyMessage(op);
                    }
                },
            },
        );

        this.messageHandlers.set(
            "createSubDirectory",
            {
                process: (op: IDirectoryCreateSubDirectoryOperation, local, message) => {
                    const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (parentSubdir) {
                        parentSubdir.processCreateSubDirectoryMessage(op, local, message);
                    }
                },
                submit: (op: IDirectoryCreateSubDirectoryOperation) => {
                    const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (parentSubdir) {
                        parentSubdir.submitSubDirectoryMessage(op);
                    }
                },
            },
        );

        this.messageHandlers.set(
            "deleteSubDirectory",
            {
                process: (op: IDirectoryDeleteSubDirectoryOperation, local, message) => {
                    const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (parentSubdir) {
                        parentSubdir.processDeleteSubDirectoryMessage(op, local, message);
                    }
                },
                submit: (op: IDirectoryDeleteSubDirectoryOperation) => {
                    const parentSubdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    if (parentSubdir) {
                        parentSubdir.submitSubDirectoryMessage(op);
                    }
                },
            },
        );

        // Ops with type "act" describe actions taken by custom value type handlers of whatever item is
        // being addressed.  These custom handlers can be retrieved from the ValueTypeLocalValue which has
        // stashed its valueType (and therefore its handlers).  We also emit a valueChanged for anyone
        // watching for manipulations of that item.
        this.messageHandlers.set(
            "act",
            {
                process: (op: IDirectoryValueTypeOperation, local, message) => {
                    const subdir = this.getWorkingDirectory(op.path) as SubDirectory;
                    // Subdir might not exist if we deleted it
                    if (!subdir) {
                        return;
                    }

                    const localValue = subdir.getLocalValue<ValueTypeLocalValue>(op.key);
                    // Local value might not exist if we deleted it
                    if (!localValue) {
                        return;
                    }

                    const handler = localValue.getOpHandler(op.value.opName);
                    const previousValue = localValue.value;
                    const translatedValue = this.runtime.IComponentSerializer.parse(
                        JSON.stringify(op.value.value), this.runtime.IComponentHandleContext);
                    handler.process(previousValue, translatedValue, local, message);
                    const event: IDirectoryValueChanged = { key: op.key, path: op.path, previousValue };
                    this.emit("valueChanged", event, local, message);
                },
                submit: (op) => {
                    this.submitDirectoryMessage(op);
                },
            },
        );
    }
}

/**
 * Node of the directory tree.
 * @sealed
 */
class SubDirectory implements IDirectory {
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
     * If a clear has been performed locally but not yet ack'd from the server, then this stores the client sequence
     * number of that clear operation.  Otherwise, is -1.
     */
    private pendingClearClientSequenceNumber: number = -1;

    /**
     * Constructor.
     * @param directory - Reference back to the SharedDirectory to perform operations
     * @param runtime - The component runtime this directory is associated with
     * @param absolutePath - The absolute path of this IDirectory
     */
    constructor(
        private readonly directory: SharedDirectory,
        private readonly runtime: IComponentRuntime,
        public readonly absolutePath: string) {
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
    public get<T = any>(key: string): T {
        if (!this._storage.has(key)) {
            return undefined;
        }

        return this._storage.get(key).value as T;
    }

    /**
     * {@inheritDoc IDirectory.wait}
     */
    public async wait<T = any>(key: string): Promise<T> {
        // Return immediately if the value already exists
        if (this._storage.has(key)) {
            return this._storage.get(key).value as T;
        }

        // Otherwise subscribe to changes
        return new Promise<T>((resolve, reject) => {
            const callback = (changed: IDirectoryValueChanged) => {
                if (this.absolutePath === changed.path && key === changed.key) {
                    resolve(this.get<T>(changed.key));
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

        const localValue = this.directory.localValueMaker.fromInMemory(value);
        const serializableValue = makeSerializable(
            localValue,
            this.runtime.IComponentSerializer,
            this.runtime.IComponentHandleContext,
            this.directory.handle);

        this.setCore(
            key,
            localValue,
            true,
            null,
        );

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
     * {@inheritDoc IValueTypeCreator.createValueType}
     */
    public createValueType(key: string, type: string, params: any): this {
        const localValue = this.directory.localValueMaker.makeValueType(
            type,
            this.directory.makeDirectoryValueOpEmitter(key, this.absolutePath),
            params,
        );

        // TODO ideally we could use makeSerialized in this case as well. But the interval
        // collection has assumptions of attach being called prior. Given the IComponentSerializer it
        // may be possible to remove custom value type serialization entirely.
        const transformedValue = params
            ? JSON.parse(this.runtime.IComponentSerializer.stringify(
                params,
                this.runtime.IComponentHandleContext,
                this.directory.handle))
            : params;

        // This is a special form of serialized valuetype only used for set, containing info for initialization.
        // After initialization, the serialized form will need to come from the .store of the value type's factory.
        const serializableValue = { type, value: transformedValue };

        this.setCore(
            key,
            localValue,
            true,
            null,
        );

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

        this.createSubDirectoryCore(subdirName, true, null);

        const op: IDirectoryCreateSubDirectoryOperation = {
            path: this.absolutePath,
            subdirName,
            type: "createSubDirectory",
        };
        this.submitSubDirectoryMessage(op);

        return this._subdirectories.get(subdirName);
    }

    /**
     * {@inheritDoc IDirectory.getSubDirectory}
     */
    public getSubDirectory(subdirName: string): IDirectory {
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
        const op: IDirectoryDeleteSubDirectoryOperation = {
            path: this.absolutePath,
            subdirName,
            type: "deleteSubDirectory",
        };

        const successfullyRemoved = this.deleteSubDirectoryCore(subdirName, true, null);
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
    public getWorkingDirectory(relativePath: string): IDirectory {
        return this.directory.getWorkingDirectory(this.makeAbsolute(relativePath));
    }

    /**
     * Deletes the given key from within this IDirectory.
     * @param key - The key to delete
     * @returns True if the key existed and was deleted, false if it did not exist
     */
    public delete(key: string): boolean {
        const op: IDirectoryDeleteOperation = {
            key,
            path: this.absolutePath,
            type: "delete",
        };

        const successfullyRemoved = this.deleteCore(op.key, true, null);
        this.submitKeyMessage(op);
        return successfullyRemoved;
    }

    /**
     * Deletes all keys from within this IDirectory.
     */
    public clear(): void {
        const op: IDirectoryClearOperation = {
            path: this.absolutePath,
            type: "clear",
        };

        this.clearCore(true, null);
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
     * @internal
     */
    public processClearMessage(
        op: IDirectoryClearOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void {
        if (local) {
            if (this.pendingClearClientSequenceNumber === message.clientSequenceNumber) {
                this.pendingClearClientSequenceNumber = -1;
            }
            return;
        }
        this.clearExceptPendingKeys();
        this.directory.emit("clear", local, op);
    }

    /**
     * Process a delete operation.
     * @param op - The op to process
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @internal
     */
    public processDeleteMessage(
        op: IDirectoryDeleteOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void {
        if (!this.needProcessStorageOperation(op, local, message)) {
            return;
        }
        this.deleteCore(op.key, local, message);
    }

    /**
     * Process a set operation.
     * @param op - The op to process
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @internal
     */
    public processSetMessage(
        op: IDirectorySetOperation,
        context: ILocalValue,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void {
        if (!this.needProcessStorageOperation(op, local, message)) {
            return;
        }
        this.setCore(op.key, context, local, message);
    }

    /**
     * Process a create subdirectory operation.
     * @param op - The op to process
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @internal
     */
    public processCreateSubDirectoryMessage(
        op: IDirectoryCreateSubDirectoryOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void {
        if (!this.needProcessSubDirectoryOperations(op, local, message)) {
            return;
        }
        this.createSubDirectoryCore(op.subdirName, local, message);
    }

    /**
     * Process a delete subdirectory operation.
     * @param op - The op to process
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @internal
     */
    public processDeleteSubDirectoryMessage(
        op: IDirectoryDeleteSubDirectoryOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void {
        if (!this.needProcessSubDirectoryOperations(op, local, message)) {
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
        const clientSequenceNumber = this.directory.submitDirectoryMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingClearClientSequenceNumber = clientSequenceNumber;
        }
    }

    /**
     * Submit a key operation.
     * @param op - The operation
     * @internal
     */
    public submitKeyMessage(op: IDirectoryKeyOperation): void {
        const clientSequenceNumber = this.directory.submitDirectoryMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingKeys.set(op.key, clientSequenceNumber);
        }
    }

    /**
     * Submit a subdirectory operation.
     * @param op - The operation
     * @internal
     */
    public submitSubDirectoryMessage(op: IDirectorySubDirectoryOperation): void {
        const clientSequenceNumber = this.directory.submitDirectoryMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingSubDirectories.set(op.subdirName, clientSequenceNumber);
        }
    }

    /**
     * Get the storage of this subdirectory in a serializable format, to be used in snapshotting.
     * @returns The JSONable string representing the storage of this subdirectory
     * @internal
     */
    public *getSerializedStorage() {
        for (const [key, localValue] of this._storage) {
            const value = localValue.makeSerialized(
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.directory.handle);
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
     * @returns True if the operation should be processed, false otherwise
     */
    private needProcessStorageOperation(
        op: IDirectoryKeyOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): boolean {
        if (this.pendingClearClientSequenceNumber !== -1) {
            // If I have a NACK clear, we can ignore all ops.
            return false;
        }

        if (this.pendingKeys.has(op.key)) {
            // Found an NACK op, clear it from the directory if the latest sequence number in the directory
            // match the message's and don't process the op.
            if (local) {
                const pendingKeyClientSequenceNumber = this.pendingKeys.get(op.key);
                if (pendingKeyClientSequenceNumber === message.clientSequenceNumber) {
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
     * @returns True if the operation should be processed, false otherwise
     */
    private needProcessSubDirectoryOperations(
        op: IDirectorySubDirectoryOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): boolean {
        if (this.pendingSubDirectories.has(op.subdirName)) {
            if (local) {
                const pendingSubDirectoryClientSequenceNumber = this.pendingSubDirectories.get(op.subdirName);
                if (pendingSubDirectoryClientSequenceNumber === message.clientSequenceNumber) {
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
            temp.set(key, this._storage.get(key));
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
    private clearCore(local: boolean, op: ISequencedDocumentMessage) {
        this._storage.clear();
        this.directory.emit("clear", local, op);
    }

    /**
     * Delete implementation used for both locally sourced deletes as well as incoming remote deletes.
     * @param key - The key being deleted
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote delete, or null if from a local delete
     * @returns True if the key existed and was deleted, false if it did not exist
     */
    private deleteCore(key: string, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        const successfullyRemoved = this._storage.delete(key);
        if (successfullyRemoved) {
            const event: IDirectoryValueChanged = { key, path: this.absolutePath, previousValue };
            this.directory.emit("valueChanged", event, local, op);
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
    private setCore(key: string, value: ILocalValue, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        this._storage.set(key, value);
        const event: IDirectoryValueChanged = { key, path: this.absolutePath, previousValue };
        this.directory.emit("valueChanged", event, local, op);
    }

    /**
     * Create subdirectory implementation used for both locally sourced creation as well as incoming remote creation.
     * @param subdirName - The name of the subdirectory being created
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote create, or null if from a local create
     */
    private createSubDirectoryCore(subdirName: string, local: boolean, op: ISequencedDocumentMessage) {
        if (!this._subdirectories.has(subdirName)) {
            this._subdirectories.set(
                subdirName,
                new SubDirectory(this.directory, this.runtime, posix.join(this.absolutePath, subdirName)),
            );
        }
    }

    /**
     * Delete subdirectory implementation used for both locally sourced creation as well as incoming remote creation.
     * @param subdirName - The name of the subdirectory being deleted
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote delete, or null if from a local delete
     */
    private deleteSubDirectoryCore(subdirName: string, local: boolean, op: ISequencedDocumentMessage) {
        // This should make the subdirectory structure unreachable so it can be GC'd and won't appear in snapshots
        // Might want to consider cleaning out the structure more exhaustively though?
        return this._subdirectories.delete(subdirName);
    }
}
