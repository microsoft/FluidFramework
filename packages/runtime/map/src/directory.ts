/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ParsedPath, posix as pathutil } from "path";
import { defaultValueTypes } from "./defaultTypes";
import { IMapOperation } from "./definitions";
import { ISharedDirectory, IValueChanged, IValueType } from "./interfaces";
import { SharedMap } from "./map";
import { ILocalViewElement, MapView } from "./view";

/**
 * The extension that defines the directory
 */
export class DirectoryExtension {
    public static readonly Type = "https://graph.microsoft.com/types/directory";

    public readonly type: string = DirectoryExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedDirectory> {

        const directory = new SharedDirectory(id, runtime);
        this.registerValueTypes(directory, defaultValueTypes);
        await directory.load(minimumSequenceNumber, headerOrigin, services);

        return directory;
    }

    public create(document: IComponentRuntime, id: string): ISharedDirectory {
        const directory = new SharedDirectory(id, document);
        this.registerValueTypes(directory, defaultValueTypes);
        directory.initializeLocal();

        return directory;
    }

    private registerValueTypes(directory: SharedDirectory, valueTypes: Array<IValueType<any>>) {
        for (const type of valueTypes) {
            directory.registerValueType(type);
        }
    }
}

/**
 * SharedDirectory functions very similarly to SharedMap (e.g. getPath/setPath can be used much like get/set),
 * but will create supporting SubDirectory objects when the key looks like a path.  If the user does a getPath
 * on a key that is a SubDirectory, then that retrieved SubDirectory can be used with relative paths for
 * convenience.  E.g.:
 * mySharedDirectory.setPath("/a/b/c/foo", val1);
 * mySharedDirectory.setPath("/a/b/c/bar", val2);
 * const mySubDir = mySharedDirectory.getPath("/a/b/c");
 * mySubDir.getPath("foo"); // val1
 * mySubDir.getPath("bar"); // val2
 */
export class SharedDirectory extends SharedMap implements ISharedDirectory {
    /**
     * Path separator character.
     */
    public static readonly PathSeparator = "/";

    /**
     * The root of our directory structure.
     */
    public readonly subdirectory: ViewSubDirectory;

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
        this.subdirectory = new ViewSubDirectory(this.view);
    }

    /**
     * Sets a value at a path, and will create subdirectories in between if needed.
     * @param path - full path string from root, including key name.  E.g. "/path/to/my/key" will produce
     * 3 subdirectories and one key
     * @param value - value to store in the key
     * @param type - value type
     */
    public setPath<T = any>(path: string, value: T, type?: string): void {
        const values = this.view.prepareOperationValue(path, value, type);

        const op: IMapOperation = {
            key: path,
            type: "setPath",
            value: values.operationValue,
        };

        this.setPathCore(
            op.key,
            {
                localType: values.operationValue.type,
                localValue: values.localValue,
            },
            true,
            null);
        this.submitMapKeyMessage(op);
    }

    /**
     * Returns a SubDirectory object if a subdirectory exists at the given path, or undefined otherwise.
     * @param path - full path string from root, including the key!  "/this/is/a/subdirectory" will return the
     * SubDirectory for "a", but "/this/is/a/subdirectory/key" will return the SubDirectory for
     * "subdirectory".
     */
    public pathToSubdir(path: string) {
        let relPath = path;
        if (pathutil.isAbsolute(path)) {
            relPath = path.substring(1);
        }
        const parsedPath = pathutil.parse(relPath);
        let subdir: SubDirectory = this.subdirectory;
        if (parsedPath.dir.length > 0) {
            const dirNames = parsedPath.dir.split(SharedDirectory.PathSeparator);
            for (const dirName of dirNames) {
                let childDir: SubDirectory;
                if (!subdir.hasKey(dirName)) {
                    return undefined;
                } else {
                    const anyValue = subdir.getKey(dirName);
                    if (anyValue instanceof SubDirectory) {
                        childDir = anyValue;
                    } else {
                        return undefined;
                    }
                }
                subdir = childDir;
            }
        }
        return subdir;
    }

    /**
     * Checks if something exists at the given path.
     * @param path - full path string from root
     */
    public hasPath<T = any>(path: string): boolean {
        return this.getPath(path) !== undefined;
    }

    /**
     * Get whatever exists at the given path.
     * @param path - full path string from root
     */
    public getPath<T = any>(path: string): T {
        const subdir = this.pathToSubdir(path);
        if (subdir) {
            return subdir.getKey<T>(pathutil.basename(path));
        }
    }

    /**
     * Async version of getPath.
     * @param path - full path string from root
     */
    public async waitPath<T>(path: string): Promise<T> {
        if (this.hasPath(path)) {
            return this.getPath(path);
        }

        // Otherwise subscribe to changes
        return new Promise<T>((resolve, reject) => {
            const callback = (value: IValueChanged) => {
                if (path === value.key) {
                    resolve(this.getPath(value.key));
                    this.removeListener("valueChanged", callback);
                }
            };

            this.on("valueChanged", callback);
        });
    }

    /**
     * Adds op handlers for setPath.
     */
    protected setMessageHandlers() {
        // tslint:disable:no-backbone-get-set-outside-model
        this.messageHandler.set(
            "setPath",
            {
                prepare: (op, local) => {
                    return local ? Promise.resolve(null) : this.view.prepareSetCore(op.key, op.value);
                },
                process: (op, context: ILocalViewElement, local, message) => {
                    if (!this.needProcessKeyOperations(op, local, message)) {
                        return;
                    }
                    this.setPathCore(op.key, context, local, message);
                },
                submit: (op) => {
                    this.submitMapKeyMessage(op);
                },
            });

    }

    /**
     * Core handling of setting the path.
     * @param path - full path string from root
     * @param value - pre-prepared value to be set
     * @param local - whether the op came from the local machine
     * @param op - the setPath op
     */
    private setPathCore<T = any>(path: string,
                                 value: ILocalViewElement,
                                 local: boolean,
                                 op: ISequencedDocumentMessage) {
        let relPath = path;
        if (pathutil.isAbsolute(path)) {
            relPath = path.substring(1);
        }
        const parsedPath = pathutil.parse(relPath);
        const subdir = this.ensureSubDirectories(parsedPath);
        const previousValue = subdir.getKey(parsedPath.name);
        subdir.setKey(parsedPath.name, value.localValue);
        const event: IValueChanged = { key: path, previousValue };
        this.emit("valueChanged", event, local, op);
    }

    /**
     * Checks that the directory structure to the given path exists, or creates it if it does not.
     * @param parsedPath - a parsed path (using posix.parse()) from root
     */
    private ensureSubDirectories(parsedPath: ParsedPath): SubDirectory {
        let absolutePath = "/";
        let subdir: SubDirectory = this.subdirectory;
        if (parsedPath.dir.length > 0) {
            const dirNames = parsedPath.dir.split(SharedDirectory.PathSeparator);
            for (const dirName of dirNames) {
                absolutePath += (dirName + SharedDirectory.PathSeparator);
                let childDir: SubDirectory;
                if (!subdir.hasKey(dirName)) {
                    childDir = new SubDirectory(this, absolutePath);
                    subdir.setKey(dirName, childDir);
                } else {
                    childDir = subdir.getKey(dirName);
                }
                subdir = childDir;
            }
        }
        return subdir;
    }

    // TODO: block ISharedMap methods such as get, set, clear by overriding them and raising an
    // exception (these are not in ISharedDirectory and so not visible in the public API)
}

/**
 * Node of the directory tree.
 */
export class SubDirectory implements ISharedDirectory {
    /**
     * Collection of keys and further SubDirectories
     */
    private readonly data = new Map<string, any>();

    /**
     * Constructor
     * @param directory - reference back to the SharedDirectory to perform operations
     * @param absolutePath - the absolute path of this SubDirectory
     */
    constructor(private readonly directory: SharedDirectory, public absolutePath: string) {
    }

    /**
     * Checks if the key exists in this SubDirectory.
     * @param key - string identifier
     */
    public hasKey(key: string) {
        return this.data.has(key);
    }

    /**
     * Retrieves whatever is at the given key in this SubDirectory.
     * @param key - string identifier
     */
    public getKey<T = any>(key: string): T {
        return this.data.get(key) as T;
    }

    /**
     * Sets the given value for the given key in this SubDirectory.
     * @param key - string identifier
     * @param value - value to set (currently expecting an unpacked value, not an ILocalViewElement)
     */
    public setKey<T = any>(key: string, value: T) {
        this.data.set(key, value);
    }

    /**
     * Checks whether the given relative path exists, as referenced from this SubDirectory
     * @param path - relative path
     */
    public hasPath(path: string): boolean {
        return this.directory.hasPath(this.buildPath(path));
    }

    /**
     * Retrieves whatever is at the given relative path, as referenced from this SubDirectory
     * @param path - relative path
     */
    public getPath<T = any>(path: string): T {
        return this.directory.getPath(this.buildPath(path));
    }

    /**
     * Sets the given value at the given relative path, as referenced from this SubDirectory
     * @param path - relative path
     * @param value - value to set
     * @param type - value type
     */
    public setPath<T = any>(path: string, value: T, type?: string): void {
        this.directory.setPath(this.buildPath(path), value, type);
    }

    /**
     * Async version of getPath
     * @param path - relative path
     */
    public async waitPath<T>(path: string): Promise<T> {
        return this.directory.waitPath(this.buildPath(path));
    }

    /**
     * Converts the given relative path into an absolute path
     * @param path - relative path
     */
    private buildPath(path: string) {
        return pathutil.resolve(this.absolutePath, path);
    }
}

export class ViewSubDirectory extends SubDirectory {
    constructor(private readonly view: MapView) {
        super(view.getMap() as SharedDirectory, "/");
    }
    public hasKey(key: string) {
        return this.view.has(key);
    }
    public getKey(key: string) {
        return this.view.get(key);
    }
    public setKey<T = any>(key: string, value: T) {
        this.view.set(key, value);
    }
}
