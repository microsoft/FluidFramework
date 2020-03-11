/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

<<<<<<< HEAD
import * as assert from "assert";
import { IDirectory } from "@microsoft/fluid-map";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

/**
 * - Create a new object from the passed subDirectory.
 * - Modify the set method to call the setInterceptionCallback before calling set on the underlying object.
 * - The setInterceptionCallback and the call to the underlying object are wrapped around an orderSequentially
 *   call to batch any operations that might happen in the callback.
 * - Modify the sub directory methods to create / return a wrapper object that in turn intercepts the set method and
 *   calls the setInterceptionCallback.
 * - When a sub directory is created from this directory, this base directory object is passed to it which is passed
 *   into the interception callback.
 *
 * @param baseDirectory - The base directory in the directory structure that is passed to the interception callback
 * @param subDirectory - The underlying object that is to be intercepted
 * @param context - The IComponentContext that will be used to call orderSequentially
 * @param setInterceptionCallback - The interception callback to be called
 *
 * @returns A new sub directory that intercepts the set method and calls the setInterceptionCallback.
 */
function createSubDirectoryWithInterception<T extends IDirectory>(
    baseDirectory: T,
    subDirectory: T,
    context: IComponentContext,
    setInterceptionCallback: (
        baseDirectory: IDirectory,
        subDirectory: IDirectory,
        key: string,
        value: any) => void): T {
    const subDirectoryWithInterception = Object.create(subDirectory);

    // executingCallback keeps track of whether set is called recursively from the setInterceptionCallback.
    let executingCallback: boolean = false;

    subDirectoryWithInterception.set = (key: string, value: any) => {
        let directory;
        // Set should not be called on the wrapped object from the interception callback as this will lead to
        // infinite recursion.
        assert(executingCallback === false, "set called recursively from the interception callback");

        context.hostRuntime.orderSequentially(() => {
            directory = subDirectory.set(key, value);
            executingCallback = true;
            try {
                setInterceptionCallback(baseDirectory, subDirectory, key, value);
            } finally {
                executingCallback = false;
            }
=======
import { SharedDirectory } from "@microsoft/fluid-map";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

/**
 * - Create a new object from the passed ShareDirectory.
 * - Modify the set method to call the interceptionCallback before calling set on the underlying SharedDirectory.
 * - The interceptionCallback and the call to the underlying SharedDirectory are wrapped around an
 *   orderSequentially call to batch any operations that might happen in the callback.
 *
 * @param sharedDirectory - The underlying SharedDirectory
 * @param context - The IComponentContext that will be used to call orderSequentially
 * @param interceptionCallback - The interception callback to be called
 *
 * @returns A new SharedDirectory that intercepts the set method and calls the interceptionCallback.
 */
export function createSharedDirectoryWithInterception(
    sharedDirectory: SharedDirectory,
    context: IComponentContext,
    interceptionCallback: (key: string) => void): SharedDirectory {
    const sharedDirectoryWithInterception = Object.create(sharedDirectory);

    sharedDirectoryWithInterception.set = (key: string, value: any) => {
        let directory;
        context.hostRuntime.orderSequentially(() => {
            interceptionCallback(key);
            directory = sharedDirectory.set(key, value);
>>>>>>> SharedMap and SharedDirectory with Interception that creates a wrapper to support features like user attribution.
        });
        return directory;
    };

<<<<<<< HEAD
    subDirectoryWithInterception.createSubDirectory = (subdirName: string): IDirectory => {
        const subSubDirectory = subDirectory.createSubDirectory(subdirName);
        return createSubDirectoryWithInterception(baseDirectory, subSubDirectory, context, setInterceptionCallback);
    };

    subDirectoryWithInterception.getSubDirectory = (subdirName: string): IDirectory => {
        const subSubDirectory = subDirectory.getSubDirectory(subdirName);
        return subSubDirectory === undefined ?
            subSubDirectory :
            createSubDirectoryWithInterception(baseDirectory, subSubDirectory, context, setInterceptionCallback);
    };

    subDirectoryWithInterception.subdirectories = (): IterableIterator<[string, IDirectory]> => {
        const localDirectoriesIterator = subDirectory.subdirectories();
        const iterator = {
            next(): IteratorResult<[string, IDirectory]> {
                const nextVal = localDirectoriesIterator.next();
                if (nextVal.done) {
                    return { value: undefined, done: true };
                } else {
                    // Wrap the stored subdirectory in the interception wrapper.
                    const subDir = createSubDirectoryWithInterception(
                        baseDirectory,
                        nextVal.value[1],
                        context,
                        setInterceptionCallback);
                    return { value: [nextVal.value[0], subDir], done: false };
                }
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    };

    subDirectoryWithInterception.getWorkingDirectory = (relativePath: string): IDirectory => {
        const subSubDirectory = subDirectory.getWorkingDirectory(relativePath);
        return createSubDirectoryWithInterception(baseDirectory, subSubDirectory, context, setInterceptionCallback);
    };

    return subDirectoryWithInterception;
}

/**
 * - Create a new object from the passed IDirectory object.
 * - Modify the set method to call the setInterceptionCallback before calling set on the underlying object.
 * - The setInterceptionCallback and the call to the underlying object are wrapped around an orderSequentially
 *   call to batch any operations that might happen in the callback.
 * - Modify the sub directory methods to create / return a wrapper object that in turn intercepts the set method and
 *   calls the setInterceptionCallback.
 * - When a sub directory is created from this directory, this directory object is passed to it which is passed into
 *   the interception callback.
 *
 * @param baseDirectory - The underlying object that is to be intercepted
 * @param context - The IComponentContext that will be used to call orderSequentially
 * @param setInterceptionCallback - The interception callback to be called
 *
 * @returns A new IDirectory object that intercepts the set method and calls the setInterceptionCallback.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function createDirectoryWithInterception<T extends IDirectory>(
    baseDirectory: T,
    context: IComponentContext,
    setInterceptionCallback: (
        baseDirectory: IDirectory,
        subDirectory: IDirectory,
        key: string,
        value: any) => void): T {
    return createSubDirectoryWithInterception(baseDirectory, baseDirectory, context, setInterceptionCallback);
=======
    return sharedDirectoryWithInterception as SharedDirectory;
>>>>>>> SharedMap and SharedDirectory with Interception that creates a wrapper to support features like user attribution.
}
