/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/container-definitions";
import { IComponentRuntime, IObjectStorageService, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObject, ISharedObjectExtension, SharedObject, ValueType } from "@prague/shared-object-common";
import { posix } from "path";
import { debug } from "./debug";
import {
    IDirectory,
    IDirectoryValueChanged,
    ILocalViewElement,
    ISharedDirectory,
    IValueOpEmitter,
    IValueOperation,
    IValueType,
} from "./interfaces";

const snapshotFileName = "header";

/**
 * The extension that defines the directory
 */
export class DirectoryExtension {
    public static readonly Type = "https://graph.microsoft.com/types/directory";

    public readonly type: string = DirectoryExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    constructor(private readonly defaultValueTypes: Array<IValueType<any>> = []) {
    }

    public async load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedDirectory> {

        const directory = new SharedDirectory(id, runtime);
        this.registerValueTypes(directory);
        await directory.load(minimumSequenceNumber, headerOrigin, services);

        return directory;
    }

    public create(document: IComponentRuntime, id: string): ISharedDirectory {
        const directory = new SharedDirectory(id, document);
        this.registerValueTypes(directory);
        directory.initializeLocal();

        return directory;
    }

    private registerValueTypes(directory: SharedDirectory) {
        for (const type of this.defaultValueTypes) {
            directory.registerValueType(type);
        }
    }
}

// Definines the in-memory object structure to be used for the conversion to/from serialized.
// Directly used in JSON.stringify, direct result from JSON.parse
// TODO: no export
export interface IDirectoryDataObject {
    storage?: {[key: string]: ITypeAnnotatedValue};
    subdirectories?: {[subdirName: string]: IDirectoryDataObject};
}

// The remote-ready type and value (e.g. ready for serialization/deserialization via JSON.stringify/parse)
export interface ITypeAnnotatedValue {
    type: string;
    value: any;
}

/**
 * Description of a directory delta operation
 */
export interface IDirectoryOperation {
    // the type of the Directory operation ("set"/"delete"/"clear")
    type: string;
    key?: string;
    path: string;
    value?: ITypeAnnotatedValue;
}

interface IDirectoryMessageHandler {
    prepare(op: IDirectoryOperation, local: boolean, message: ISequencedDocumentMessage): Promise<any>;
    process(
        op: IDirectoryOperation,
        context: ILocalViewElement,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void;
    submit(op: IDirectoryOperation);
}

class DirectoryValueOpEmitter implements IValueOpEmitter {
    constructor(
        private readonly type: string,
        private readonly key: string,
        private readonly path: string,
        private readonly directory: SharedDirectory,
    ) {}

    public emit(operation: string, previousValue: any, params: any) {
        const op: IDirectoryOperation = {
            key: this.key,
            path: this.path,
            type: this.type,
            value: {
                type: operation,
                value: params,
            },
        };

        this.directory.submitDirectoryMessage(op);
        const event: IDirectoryValueChanged = { key: this.key, path: this.path, previousValue };
        this.directory.emit("valueChanged", event, true, null);
    }
}

/**
 * SharedDirectory provides a hierarchical organization of map-like data structures as SubDirectories.
 * The values stored within can be accessed like a map, and the hierarchy can be navigated using path syntax.
 * SubDirectories can be retrieved for use as working directories.  E.g.:
 * mySharedDirectory.setKeyAtPath("foo", val1, "/a/b/c/");
 * mySharedDirectory.setKeyAtPath("bar", val2, "/a/b/c/");
 * const mySubDir = mySharedDirectory.getWorkingDirectory("/a/b/c");
 * mySubDir.get("foo"); // val1
 * mySubDir.get("bar"); // val2
 */
export class SharedDirectory extends SharedObject implements ISharedDirectory {
    /**
     * Create a new shared directory
     *
     * @param runtime - component runtime the new shared directory belongs to
     * @param id - optional name of the shared directory
     * @returns newly create shared directory (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string): SharedDirectory {
        return runtime.createChannel(SharedObject.getIdForCreate(id), DirectoryExtension.Type) as SharedDirectory;
    }

    /**
     * Get a factory for SharedDirectory to register with the component.
     *
     * @returns a factory that creates and load SharedDirectory
     */
    public static getFactory(defaultValueTypes: Array<IValueType<any>> = []): ISharedObjectExtension {
        return new DirectoryExtension(defaultValueTypes);
    }

    public [Symbol.toStringTag]: string = "SharedDirectory";

    private readonly root: SubDirectory = new SubDirectory(this, posix.sep);
    private readonly valueTypes: Map<string, IValueType<any>> = new Map();
    private readonly messageHandlers: Map<string, IDirectoryMessageHandler> = new Map();

    /**
     * Constructs a new shared directory. If the object is non-local an id and service interfaces will
     * be provided.
     * @param id - string identifier for the SharedDirectory
     * @param runtime - component runtime
     * @param type - type identifier
     */
    constructor(
        id: string,
        runtime: IComponentRuntime,
    ) {
        super(id, runtime, DirectoryExtension.Type);
        this.setMessageHandlers();
    }

    public get<T = any>(key: string): T {
        return this.root.get<T>(key);
    }

    public set<T = any>(key: string, value: T, type?: string): this {
        this.root.set(key, value, type);
        return this;
    }

    public delete(key: string): boolean {
        return this.root.delete(key);
    }

    public clear(): void {
        this.root.clear();
    }

    public has(key: string): boolean {
        return this.root.has(key);
    }

    public get size(): number {
        return this.root.size;
    }

    public forEach(callback: (value: any, key: string, map: Map<string, any>) => void): void {
        this.root.forEach(callback);
    }

    public [Symbol.iterator](): IterableIterator<[string, ILocalViewElement]> {
        return this.root[Symbol.iterator]();
    }

    public entries(): IterableIterator<[string, ILocalViewElement]> {
        return this.root.entries();
    }

    public keys(): IterableIterator<string> {
        return this.root.keys();
    }

    public values(): IterableIterator<ILocalViewElement> {
        return this.root.values();
    }

    /**
     * Returns the contents of the SharedDirectory as a string which can be rehydrated into a SharedDirectory
     * when loaded using populate().
     */
    public serialize(): string {
        const objectForm: IDirectoryDataObject = {};

        // Map SubDirectories that need serializing to the corresponding data objects they will occupy
        const subdirsToSerialize = new Map<SubDirectory, IDirectoryDataObject>();
        subdirsToSerialize.set(this.root, objectForm);

        for (const [currentSubDir, currentSubDirObject] of subdirsToSerialize) {
            for (const [key, value] of currentSubDir.entries()) {
                if (!currentSubDirObject.storage) {
                    currentSubDirObject.storage = {};
                }
                // this is a spill-style translation layer that turns the real value into a remote value
                currentSubDirObject.storage[key] = this.convertToRemote(value);
            }

            for (const [subdirName, subdir] of currentSubDir.subdirectoriesIterator()) {
                if (!currentSubDirObject.subdirectories) {
                    currentSubDirObject.subdirectories = {};
                }
                currentSubDirObject.subdirectories[subdirName] = {};
                subdirsToSerialize.set(subdir, currentSubDirObject.subdirectories[subdirName]);
            }
        }

        return JSON.stringify(objectForm);
    }

    // TODO: make private
    public async populate(data: IDirectoryDataObject): Promise<void> {
        const localValuesP = new Array<Promise<SubDirectory>>();

        // Map the data objects representing each subdirectory to their actual SubDirectory object
        const subdirsToDeserialize = new Map<IDirectoryDataObject, SubDirectory>();
        subdirsToDeserialize.set(data, this.root);

        for (const [currentSubDirObject, currentSubDir] of subdirsToDeserialize) {
            if (currentSubDirObject.subdirectories) {
                for (const [subdirName, subdirObject] of Object.entries(currentSubDirObject.subdirectories)) {
                    const newSubDir = new SubDirectory(this, `${currentSubDir.absolutePath}${posix.sep}${subdirName}`);
                    currentSubDir.setSubDirectory(subdirName, newSubDir);
                    subdirsToDeserialize.set(subdirObject, newSubDir);
                }
            }

            if (currentSubDirObject.storage) {
                for (const [key, remoteValue] of Object.entries(currentSubDirObject.storage)) {
                    // this is a fill-style promise that will get pushed into the localValuesP array
                    const populateP = this.convertFromRemote(
                                          key,
                                          currentSubDir.absolutePath,
                                          remoteValue,
                                      )
                                      .then((local) => currentSubDir.setKey(key, local.localValue, local.localType));
                    localValuesP.push(populateP);
                }
            }
        }

        await Promise.all(localValuesP);
    }

    /**
     * Get a SubDirectory within the directory, in order to use relative paths from that location.
     * @param path - Path of the SubDirectory to get, relative to the root
     */
    public getWorkingDirectory(path: string): SubDirectory {
        return this.getSubDirectoryAtPath(path);
    }

    /**
     * Gets the SubDirectory at the given path, creating it and any intermediate SubDirectories if needed.
     * @param path - the path of the SubDirectory to ensure
     */
    public ensureSubDirectoryAtPath(path: string): SubDirectory {
        const absolutePath = this.makeAbsolute(path);
        if (absolutePath === posix.sep) {
            return this.root;
        }

        const subdirs = absolutePath.substr(1).split(posix.sep);
        let currentSubDir = this.root;
        let currentPath = posix.sep;
        for (const subdir of subdirs) {
            currentPath += subdir;
            const nextSubDir = currentSubDir.getSubDirectory(subdir);
            if (nextSubDir) {
                currentSubDir = nextSubDir;
            } else {
                currentSubDir = currentSubDir.setSubDirectory(subdir, new SubDirectory(this, currentPath));
            }
        }
        return currentSubDir;
    }

    /**
     * Retrieves the SubDirectory at the given path.
     * @param path - the path to the SubDirectory
     */
    public getSubDirectoryAtPath(path: string): SubDirectory {
        const absolutePath = this.makeAbsolute(path);
        if (absolutePath === posix.sep) {
            return this.root;
        }

        let currentSubDir = this.root;
        const subdirs = absolutePath.substr(1).split(posix.sep);
        for (const subdir of subdirs) {
            currentSubDir = currentSubDir.getSubDirectory(subdir);
            if (!currentSubDir) {
                return undefined;
            }
        }
        return currentSubDir;
    }

    /**
     * Retrieves the given key from the given path.
     * @param key - the key to retrieve
     * @param path - the path to the SubDirectory containing the key
     */
    public getKeyAtPath<T = any>(key: string, path: string): T {
        const subdir = this.getSubDirectoryAtPath(path);
        if (!subdir) {
            return undefined;
        }
        return subdir.getKey<T>(key);
    }

    /**
     * Sets the given key at the given path.  Creates the SubDirectory and any intermediate SubDirectories if needed.
     * @param key - the key to set
     * @param value - the value to set the key to
     * @param path - the path to the SubDirectory where the key should be set
     */
    public setKeyAtPath<T = any>(key: string, value: T, path: string, type?: string): this {
        this.ensureSubDirectoryAtPath(path)
            .setKey(key, value, type);
        return this;
    }

    public deleteKeyAtPath(key: string, path: string): boolean {
        return this.getSubDirectoryAtPath(path)
                   .deleteKey(key);
    }

    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: this.serialize(),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };
        return tree;
    }

    public submitDirectoryMessage(op: IDirectoryOperation): number {
        return this.submitLocalMessage(op);
    }

    /**
     * Registers a new value type on the directory
     */
    public registerValueType<T>(type: IValueType<T>) {
        this.valueTypes.set(type.name, type);

        function getOpHandler(op: IDirectoryOperation): IValueOperation<T> {
            const handler = type.ops.get(op.value.type);
            if (!handler) {
                throw new Error("Unknown type message");
            }

            return handler;
        }

        // This wraps the IValueOperations (from within the passed IValueType) into an IDirectoryMessageHandler.
        // Doing so allows the directory to handle unfamiliar messages from the registered value types --
        // first by retrieving the specified item and then by applying the provided handlers.
        const valueTypeMessageHandler: IDirectoryMessageHandler = {
            prepare: async (op, local, message) => {
                const handler = getOpHandler(op);
                const value = this.getKeyAtPath<T>(op.key, op.path);
                return handler.prepare(value, op.value.value, local, message);
            },

            process: (op, context, local, message) => {
                const handler = getOpHandler(op);
                const previousValue = this.getKeyAtPath<T>(op.key, op.path);
                handler.process(previousValue, op.value.value, context, local, message);
                const event: IDirectoryValueChanged = { key: op.key, path: op.path, previousValue };
                this.emit("valueChanged", event, local, message);
            },

            submit: (op) => {
                this.submitLocalMessage(op);
            },
        };

        this.messageHandlers.set(type.name, valueTypeMessageHandler);
    }

    // TODO: make private
    public prepareOperationValue<T = any>(key: string, path: string, value: T, type?: string) {
        let operationValue: ITypeAnnotatedValue;
        // assumption is that if type is passed, it's a value type
        if (type && type !== ValueType[ValueType.Shared] && type !== ValueType[ValueType.Plain]) {
            const valueType = this.getValueType(type);
            if (!valueType) {
                throw new Error(`Unknown type '${type}' specified`);
            }

            // set operationValue first with the raw value params prior to doing the load
            operationValue = {
                type,
                value,
            };
            // tslint:disable-next-line:no-parameter-reassignment
            value = valueType.factory.load(new DirectoryValueOpEmitter(type, key, path, this), value) as T;
        } else {
            const valueType = SharedObject.is(value)
                ? ValueType[ValueType.Shared]
                : ValueType[ValueType.Plain];
            operationValue = this.convertToRemote({ localType: valueType, localValue: value });
        }
        return { operationValue, localValue : value };
    }

    public submitMessage(op: IDirectoryOperation): number {
        return this.submitLocalMessage(op);
    }

    /**
     * Registers a listener on the specified events
     */
    public on(
        event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: this) => void): this;
    public on(event: "valueChanged", listener: (
        changed: IDirectoryValueChanged,
        local: boolean,
        op: ISequencedDocumentMessage,
        target: this) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    protected onDisconnect() {
        debug(`Directory ${this.id} is now disconnected`);
    }

    protected onConnect(pending: any[]) {
        debug(`Directory ${this.id} is now connected`);

        // Deal with the directory messages - for the directory it's always last one wins so we just resend
        for (const message of pending as IDirectoryOperation[]) {
            const handler = this.messageHandlers.get(message.type);
            handler.submit(message);
        }
    }

    protected async loadCore(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService) {

        const header = await storage.read(snapshotFileName);

        const data = header ? JSON.parse(Buffer.from(header, "base64")
            .toString("utf-8")) : {};
        await this.populate(data as IDirectoryDataObject);
    }

    /**
     * Registers all the shared objects stored in this directory.
     */
    protected registerCore(): void {
        const subdirsToRegisterFrom = new Array<SubDirectory>();
        subdirsToRegisterFrom.push(this.root);

        for (const currentSubDir of subdirsToRegisterFrom) {
            for (const [, value] of currentSubDir.entries()) {
                if (SharedObject.is(value.localValue)) {
                    value.localValue.register();
                }
            }

            for (const [, subdir] of currentSubDir.subdirectoriesIterator()) {
                subdirsToRegisterFrom.push(subdir);
            }
        }
    }

    protected prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (message.type === MessageType.Operation) {
            const op: IDirectoryOperation = message.contents as IDirectoryOperation;
            if (this.messageHandlers.has(op.type)) {
                return this.messageHandlers.get(op.type)
                    .prepare(op, local, message);
            }
        }

        return Promise.reject();
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (message.type === MessageType.Operation) {
            const op: IDirectoryOperation = message.contents as IDirectoryOperation;
            if (this.messageHandlers.has(op.type)) {
                this.messageHandlers.get(op.type)
                    .process(op, context as ILocalViewElement, local, message);
            }
        }
    }

    /**
     * Converts the given relative path to absolute against the root.
     * @param path - the path to convert
     */
    private makeAbsolute(path: string): string {
        return posix.resolve(posix.sep, path);
    }

    /**
     * Converts from the format we use in-memory (ILocalViewElement) to the format we can use in serialization
     * (ITypeAnnotatedValue).  As a side-effect, it will register shared objects -- but maybe that's not
     * necessary (can we guarantee it's already registered?).
     * @param localElement - local element to convert, in its in-memory format
     */
    private convertToRemote(localElement: ILocalViewElement): ITypeAnnotatedValue {
        if (localElement.localType === ValueType[ValueType.Shared]) {
            const distributedObject = localElement.localValue as ISharedObject;

            // If the directory is already registered then register the sharedObject
            // This feels slightly out of place here since it has a side effect. But is part of spilling a document.
            // Not sure if there is some kind of prep call to separate the op creation from things needed to make it
            // (like attaching)
            if (this.isRegistered()) {
                distributedObject.register();
            }
            return {
                type: ValueType[ValueType.Shared],
                value: distributedObject.id,
            };
        } else if (this.valueTypes.has(localElement.localType)) {
            const valueType = this.valueTypes.get(localElement.localType);
            return {
                type: localElement.localType,
                value: valueType.factory.store(localElement.localValue),
            };
        } else {
            return {
                type: ValueType[ValueType.Plain],
                value: localElement.localValue,
            };
        }
    }

    /**
     * The remote ITypeAnnotatedValue we're receiving (either as a result of a snapshot load or an incoming set op)
     * will have the information we need to create a real object, but will not be the real object yet.  For example,
     * we might know it's a map and the ID but not have the actual map or its data yet.  convertFromRemote's job
     * is to convert that information into a real object for local usage.
     * @param key - key of element being converted
     * @param path - path of element being converted
     * @param remote - remote type-annotated value to convert into a real object
     */
    private async convertFromRemote(
        key: string,
        path: string,
        remote: ITypeAnnotatedValue,
    ): Promise<ILocalViewElement> {
        let translatedValue: any;
        if (remote.type === ValueType[ValueType.Shared]) {
            // even though this is getting an IChannel, should be a SharedObject since set() will only mark as Shared
            // if SharedObject.is() within prepareOperationValue.
            const distributedObject = await this.runtime.getChannel(remote.value as string);
            translatedValue = distributedObject;
        } else if (remote.type === ValueType[ValueType.Plain]) {
            translatedValue = remote.value;
        } else if (this.valueTypes.has(remote.type)) {
            const valueType = this.valueTypes.get(remote.type);
            translatedValue = valueType.factory.load(
                new DirectoryValueOpEmitter(remote.type, key, path, this),
                remote.value,
            );
        } else {
            return Promise.reject(`Unknown value type "${remote.type}"`);
        }

        return {
            localType: remote.type,
            localValue: translatedValue,
        };
    }

    private getValueType(type: string) {
        return this.valueTypes.get(type);
    }

    private setMessageHandlers() {
        const defaultPrepare = (op: IDirectoryOperation, local: boolean) => Promise.resolve();
        // tslint:disable:no-backbone-get-set-outside-model
        this.messageHandlers.set(
            "clear",
            {
                prepare: defaultPrepare,
                process: (op, context, local, message) => {
                    const subdir = this.getSubDirectoryAtPath(op.path);
                    if (subdir) {
                        subdir.processClearMessage(op, context, local, message);
                    }
                },
                submit: (op) => {
                    const subdir = this.getSubDirectoryAtPath(op.path);
                    if (subdir) {
                        subdir.submitClearMessage(op);
                    }
                },
            });
        this.messageHandlers.set(
            "delete",
            {
                prepare: defaultPrepare,
                process: (op, context, local, message) => {
                    const subdir = this.getSubDirectoryAtPath(op.path);
                    if (subdir) {
                        subdir.processDeleteMessage(op, context, local, message);
                    }
                },
                submit: (op) => {
                    const subdir = this.getSubDirectoryAtPath(op.path);
                    if (subdir) {
                        subdir.submitStorageMessage(op);
                    }
                },
            });
        this.messageHandlers.set(
            "set",
            {
                prepare: (op, local) => {
                    return local ? Promise.resolve(null) : this.convertFromRemote(op.key, op.path, op.value);
                },
                process: (op, context, local, message) => {
                    const subdir = this.ensureSubDirectoryAtPath(op.path);
                    subdir.processSetMessage(op, context, local, message);
                },
                submit: (op) => {
                    const subdir = this.getSubDirectoryAtPath(op.path);
                    if (subdir) {
                        subdir.submitStorageMessage(op);
                    }
                },
            });
    }
}

/**
 * Node of the directory tree.
 */
export class SubDirectory implements IDirectory {
    public [Symbol.toStringTag]: string = "SubDirectory";

    private readonly storage: Map<string, ILocalViewElement> = new Map();
    private readonly subdirectories: Map<string, SubDirectory> = new Map();
    private readonly pendingKeys: Map<string, number> = new Map();
    private pendingClearClientSequenceNumber: number = -1;

    /**
     * Constructor.
     * @param directory - reference back to the SharedDirectory to perform operations
     * @param absolutePath - the absolute path of this SubDirectory
     */
    constructor(private readonly directory: SharedDirectory, public absolutePath: string) {
    }

    /**
     * Checks whether the given key exists in this SubDirectory.
     * @param key - the key to check
     */
    public has(key: string): boolean {
        return this.hasKey(key);
    }

    /**
     * Checks whether the given key exists in this SubDirectory.
     * @param key - the key to check
     */
    public hasKey(key: string): boolean {
        return this.storage.has(key);
    }

    /**
     * Checks whether the given SubDirectory exists as a child of this SubDirectory.
     * @param subdirName - the name of the SubDirectory to check
     */
    public hasSubDirectory(subdirName: string): boolean {
        return this.subdirectories.has(subdirName);
    }

    /**
     * Retrieves the given key from within this SubDirectory.
     * @param key - the key to retrieve
     */
    public get<T = any>(key: string): T {
        return this.getKey<T>(key);
    }

    /**
     * Retrieves the given key from within this SubDirectory.
     * @param key - the key to retrieve
     */
    public getKey<T = any>(key: string): T {
        if (!this.storage.has(key)) {
            return undefined;
        }

        return this.storage.get(key).localValue as T;
    }

    /**
     * Retrieves the given SubDirectory from within this SubDirectory.
     * @param subdirName - the name of the SubDirectory to retrieve
     */
    public getSubDirectory(subdirName: string): SubDirectory {
        return this.subdirectories.get(subdirName);
    }

    /**
     * Retrieves the given key from the given path relative to this SubDirectory.
     * @param key - the key to retrieve
     * @param path - the path to the SubDirectory containing the key
     */
    public getKeyAtPath<T = any>(key: string, path: string): T {
        return this.directory.getKeyAtPath<T>(key, this.makeAbsolute(path));
    }

    /**
     * Retrieves the given key from the given path relative to this SubDirectory.
     * @param path - the path to the SubDirectory containing the key
     */
    public getSubDirectoryAtPath(path: string): SubDirectory {
        return this.directory.getSubDirectoryAtPath(this.makeAbsolute(path));
    }

    /**
     * Sets the given value at the given relative path, as referenced from this SubDirectory.
     * @param path - relative path
     * @param value - value to set
     * @param type - value type
     */
    public set<T = any>(key: string, value: T, type?: string): this {
        this.setKey(key, value, type);
        return this;
    }

    /**
     * Sets the given key to the given value within this SubDirectory.
     * @param key - the key to set
     * @param value - the value to set the key to
     */
    public setKey<T = any>(key: string, value: T, type?: string): this {
        const values = this.directory.prepareOperationValue(key, this.absolutePath, value, type);
        const op: IDirectoryOperation = {
            key,
            path: this.absolutePath,
            type: "set",
            value: values.operationValue,
        };

        this.setCore(
            op.key,
            {
                localType: values.operationValue.type,
                localValue: values.localValue,
            },
            true,
            null);
        this.submitStorageMessage(op);
        return this;
    }

    /**
     * Sets the given SubDirectory with the given name as a child of this SubDirectory.
     * Public interface should probably only expose move/copy though to avoid non-tree structures.
     * @param subdirName - name of the SubDirectory
     * @param subdir - the actual SubDirectory
     */
    public setSubDirectory(subdirName: string, subdir: SubDirectory): SubDirectory {
        this.subdirectories.set(subdirName, subdir);
        return this.subdirectories.get(subdirName);
    }

    /**
     * Sets the given key to the given value at the given path.  Creates the SubDirectory and any
     * intermediate SubDirectories if needed.
     * @param key - the key to set
     * @param value - the value to set the key to
     * @param path - the path to the SubDirectory where the key should be set
     */
    public setKeyAtPath<T = any>(key: string, value: T, path: string, type?: string): this {
        this.directory.setKeyAtPath(key, value, this.makeAbsolute(path), type);
        return this;
    }

    /**
     * Deletes the given key from within this SubDirectory.
     * @param key - the key to delete
     */
    public delete(key: string): boolean {
        return this.deleteKey(key);
    }

    /**
     * Deletes the given key from within this SubDirectory.
     * @param key - the key to delete
     */
    public deleteKey(key: string): boolean {
        const op: IDirectoryOperation = {
            key,
            path: this.absolutePath,
            type: "delete",
        };

        const successfullyRemoved = this.deleteCore(op.key, true, null);
        this.submitStorageMessage(op);
        return successfullyRemoved;
    }

    /**
     * Deletes the given SubDirectory and all descendent keys and SubDirectories.
     * @param subdirName - the SubDirectory to delete
     */
    public deleteSubDirectory(subdirName: string): boolean {
        // This should make the subdirectory structure unreachable so it can be GC'd and won't appear in snapshots
        // Might want to consider cleaning out the structure more exhaustively though?
        return this.subdirectories.delete(subdirName);
    }

    public deleteKeyAtPath(key: string, path: string): boolean {
        return this.getSubDirectoryAtPath(path)
                   .deleteKey(key);
    }

    /**
     * Deletes all keys from within this SubDirectory.
     */
    public clear(): void {
        this.clearKeys();
    }

    /**
     * Deletes all keys from within this SubDirectory.
     */
    public clearKeys(): void {
        const op: IDirectoryOperation = {
            path: this.absolutePath,
            type: "clear",
        };

        this.clearCore(true, null);
        this.submitClearMessage(op);
    }

    /**
     * Deletes all SubDirectories under this SubDirectory.
     */
    public clearSubDirectories(): void {
        // This should make the subdirectory structure unreachable so it can be GC'd and won't appear in snapshots
        // Might want to consider cleaning out the structure more exhaustively though?
        this.subdirectories.clear();
    }

    /**
     * Issue a callback on each entry under this SubDirectory.
     * @param callback - callback to issue
     */
    public forEach(callback: (value: any, key: string, map: Map<string, any>) => void): void {
        this.storage.forEach((value, key, map) => {
            callback(value.localValue, key, map);
        });
    }

    /**
     * The number of entries under this SubDirectory.
     */
    public get size(): number {
        return this.storage.size;
    }

    /**
     * Get an iterator over the entries under this SubDirectory.
     */
    public entries(): IterableIterator<[string, ILocalViewElement]> {
        return this.storage.entries();
    }

    /**
     * Get an iterator over the keys under this Subdirectory.
     */
    public keys(): IterableIterator<string> {
        return this.storage.keys();
    }

    /**
     * Get an iterator over the SubDirectories contained within this SubDirectory.
     */
    public subdirectoriesIterator(): IterableIterator<[string, SubDirectory]> {
        return this.subdirectories.entries();
    }

    /**
     * Get an iterator over the values under this Subdirectory.
     */
    public values(): IterableIterator<ILocalViewElement> {
        return this.storage.values();
    }

    /**
     * Get an iterator over the entries under this Subdirectory.
     */
    public [Symbol.iterator](): IterableIterator<[string, ILocalViewElement]> {
        return this.entries();
    }

    /**
     * Get a SubDirectory within this SubDirectory, in order to use relative paths from that location.
     * @param path - Path of the SubDirectory to get, relative to this SubDirectory
     */
    public getWorkingDirectory(path: string): SubDirectory {
        return this.getSubDirectoryAtPath(path);
    }

    public processClearMessage(
        op: IDirectoryOperation,
        context: ILocalViewElement,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void {
        if (local) {
            if (this.pendingClearClientSequenceNumber === message.clientSequenceNumber) {
                this.pendingClearClientSequenceNumber = -1;
            }
            return;
        }
        this.clearExceptPendingKeys(this.pendingKeys);
        this.directory.emit("clear", local, op);
    }

    public processDeleteMessage(
        op: IDirectoryOperation,
        context: ILocalViewElement,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void {
        if (!this.needProcessStorageOperations(op, local, message)) {
            return;
        }
        this.deleteCore(op.key, local, message);
    }

    public processSetMessage(
        op: IDirectoryOperation,
        context: ILocalViewElement,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): void {
        if (!this.needProcessStorageOperations(op, local, message)) {
            return;
        }
        this.setCore(op.key, context, local, message);
    }

    public submitClearMessage(op: IDirectoryOperation): void {
        const clientSequenceNumber = this.directory.submitMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingClearClientSequenceNumber = clientSequenceNumber;
        }
    }

    public submitStorageMessage(op: IDirectoryOperation): void {
        const clientSequenceNumber = this.directory.submitMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingKeys.set(op.key, clientSequenceNumber);
        }
    }

    /**
     * Converts the given relative path into an absolute path.
     * @param path - relative path
     */
    private makeAbsolute(relativePath: string): string {
        return posix.resolve(this.absolutePath, relativePath);
    }

    private needProcessStorageOperations(
        op: IDirectoryOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): boolean {
        if (this.pendingClearClientSequenceNumber !== -1) {
            // If I have a NACK clear, we can ignore all ops.
            return false;
        }

        if ((this.pendingKeys.size !== 0 && this.pendingKeys.has(op.key))) {
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

    private clearExceptPendingKeys(pendingKeys: Map<string, number>) {
        // Assuming the pendingKeys is small and the map is large
        // we will get the value for the pendingKeys and clear the map
        const temp = new Map<string, ILocalViewElement>();
        pendingKeys.forEach((value, key, map) => {
            temp.set(key, this.storage.get(key));
        });
        this.storage.clear();
        temp.forEach((value, key, map) => {
            this.storage.set(key, value);
        });
    }

    private clearCore(local: boolean, op: ISequencedDocumentMessage) {
        this.storage.clear();
        this.directory.emit("clear", local, op);
    }

    private deleteCore(key: string, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        const successfullyRemoved = this.storage.delete(key);
        if (successfullyRemoved) {
            const event: IDirectoryValueChanged = { key, path: this.absolutePath, previousValue };
            this.directory.emit("valueChanged", event, local, op);
        }
        return successfullyRemoved;
    }

    private setCore(key: string, value: ILocalViewElement, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        this.storage.set(key, value);
        const event: IDirectoryValueChanged = { key, path: this.absolutePath, previousValue };
        this.directory.emit("valueChanged", event, local, op);
    }
}
