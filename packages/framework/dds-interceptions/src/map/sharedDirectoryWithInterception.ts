/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDirectory, SharedDirectory } from "@microsoft/fluid-map";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

/**
 * - Create a new object from the passed ShareDirectory.
 * - Modify the set method to call the setInterceptionCallback before calling set on the underlying SharedDirectory.
 * - The setInterceptionCallback and the call to the underlying SharedDirectory are wrapped around an
 *   orderSequentially call to batch any operations that might happen in the callback.
 *
 * @param sharedDirectory - The underlying SharedDirectory
 * @param context - The IComponentContext that will be used to call orderSequentially
 * @param setInterceptionCallback - The interception callback to be called
 *
 * @returns A new SharedDirectory that intercepts the set method and calls the setInterceptionCallback.
 */
export function createSharedDirectoryWithInterception(
    sharedDirectory: SharedDirectory,
    context: IComponentContext,
    setInterceptionCallback: (sharedDirectory: IDirectory, key: string, value: any) => void): SharedDirectory {
    const sharedDirectoryWithInterception = Object.create(sharedDirectory);

    sharedDirectoryWithInterception.set = (key: string, value: any) => {
        let directory;
        context.hostRuntime.orderSequentially(() => {
            setInterceptionCallback(sharedDirectory, key, value);
            directory = sharedDirectory.set(key, value);
        });
        return directory;
    };

    sharedDirectoryWithInterception.createSubDirectory = (subdirName: string): IDirectory => {
        const subDirectory = sharedDirectory.createSubDirectory(subdirName);
        const subDirectoryWithInterception =
            createSharedDirectoryWithInterception(subDirectory as SharedDirectory, context, setInterceptionCallback);
        return subDirectoryWithInterception as IDirectory;
    };

    return sharedDirectoryWithInterception as SharedDirectory;
}
