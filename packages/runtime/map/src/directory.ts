/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObjectExtension, SharedObject } from "@prague/shared-object-common";
import { posix } from "path";
import { IDirectory, ILocalViewElement, ISharedDirectory, IValueType } from "./interfaces";
import { SharedMap } from "./map";

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

/**
 * SharedDirectory is a SharedMap that can provide a working directory that is useful when combined with
 * path-like keys.  The working directory allows relative paths to be used in the same fashion as a
 * normal map.  E.g.:
 * mySharedDirectory.set("/a/b/c/foo", val1);
 * mySharedDirectory.set("/a/b/c/bar", val2);
 * const mySubDir = mySharedDirectory.getWorkingDirectory("/a/b/c");
 * mySubDir.get("foo"); // val1
 * mySubDir.get("bar"); // val2
 */
export class SharedDirectory extends SharedMap implements ISharedDirectory {
    /**
     * Path separator character.
     */
    public static readonly PathSeparator = "/";

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
    }

    /**
     * Get a SubDirectory within the directory, in order to use relative paths from that location.
     * @param path - Path of the SubDirectory to get, relative to the root
     */
    public getWorkingDirectory(path: string): SubDirectory {
        return new SubDirectory(this, posix.resolve(SharedDirectory.PathSeparator, path));
    }
}

/**
 * Node of the directory tree.
 */
export class SubDirectory implements IDirectory {
    public [Symbol.toStringTag]: string = "SubDirectory";

    /**
     * Constructor.
     * @param directory - reference back to the SharedDirectory to perform operations
     * @param absolutePath - the absolute path of this SubDirectory
     */
    constructor(private readonly directory: SharedDirectory, public absolutePath: string) {
    }

    /**
     * Checks whether the given relative path exists, as referenced from this SubDirectory.
     * @param path - relative path
     */
    public has(path: string): boolean {
        return this.directory.has(this.makeAbsolute(path));
    }

    /**
     * Retrieves whatever is at the given relative path, as referenced from this SubDirectory.
     * @param path - relative path
     */
    public get(path: string) {
        return this.directory.get(this.makeAbsolute(path));
    }

    /**
     * Sets the given value at the given relative path, as referenced from this SubDirectory.
     * @param path - relative path
     * @param value - value to set
     * @param type - value type
     */
    public set<T = any>(path: string, value: T, type?: string): this {
        this.directory.set(this.makeAbsolute(path), value, type);
        return this;
    }

    /**
     * Delete the entry at the given relative path.
     * @param path - relative path
     */
    public delete(path: string): boolean {
        return this.directory.delete(this.makeAbsolute(path));
    }

    /**
     * Clear all entries under this SubDirectory.
     */
    public clear(): void {
        this.forEach((value, key, map) => {
            map.delete(key);
        });
    }

    /**
     * Issue a callback on each entry under this SubDirectory.
     * @param callback - callback to issue
     */
    public forEach(callback: (value: any, key: string, map: Map<string, any>) => void): void {
        this.directory.forEach((value, key, map) => {
            if (this.checkInSubtree(key)) {
                callback(value, key, map);
            }
        });
    }

    /**
     * The number of entries under this SubDirectory.
     */
    public get size(): number {
        let count = 0;
        this.forEach((value, key, map) => {
            count++;
        });
        return count;
    }

    /**
     * Get an iterator over the entries under this SubDirectory.
     */
    public entries(): IterableIterator<[string, ILocalViewElement]> {
        const directoryEntriesArray = [...this.directory.entries()];
        const subDirectoryEntriesArray = directoryEntriesArray.filter(([absolutePath, value]) => {
            return this.checkInSubtree(absolutePath);
        });
        return this.getValuesIterator(subDirectoryEntriesArray);
    }

    /**
     * Get an iterator over the keys under this Subdirectory.
     */
    public keys(): IterableIterator<string> {
        const subDirectoryKeysArray = [...this.directory.keys()].filter(this.checkInSubtree.bind(this));
        return this.getValuesIterator(subDirectoryKeysArray);
    }

    /**
     * Get an iterator over the values under this Subdirectory.
     */
    public values(): IterableIterator<ILocalViewElement> {
        const valuesArray = [...this.entries()].map(([absolutePath, value]) => {
            return value;
        });

        return this.getValuesIterator(valuesArray);
    }

    /**
     * Get an iterator over the entries under this Subdirectory.
     */
    public [Symbol.iterator](): IterableIterator<[string, ILocalViewElement]> {
        return this.entries();
    }

    /**
     * Async version of get.
     * @param path - relative path
     */
    public async wait<T>(path: string): Promise<T> {
        return this.directory.wait(this.makeAbsolute(path));
    }

    /**
     * Get a SubDirectory within this SubDirectory, in order to use relative paths from that location.
     * @param path - Path of the SubDirectory to get, relative to this SubDirectory
     */
    public getWorkingDirectory(path: string): SubDirectory {
        return new SubDirectory(this.directory, this.makeAbsolute(path));
    }

    /**
     * Converts the given relative path into an absolute path.
     * @param path - relative path
     */
    private makeAbsolute(relativePath: string): string {
        return posix.resolve(this.absolutePath, relativePath);
    }

    /**
     * Verifies if a given absolute path is under this SubDirectory.
     * @param absolutePath - path to verify
     */
    private checkInSubtree(absolutePath: string): boolean {
        return absolutePath.indexOf(this.absolutePath) === 0;
    }

    /**
     * Workaround for Array.prototype.values() missing from older versions of Node.
     * @param valueArray - Array of values to iterate over
     */
    private getValuesIterator<T>(valueArray: T[]): IterableIterator<T> {
        let curr = 0;
        const iterator = {
            next() {
                if (curr === valueArray.length) {
                    return { value: undefined, done: true };
                } else {
                    const returnVal = valueArray[curr++];
                    return { value: returnVal, done: false };
                }
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }
}
