/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import { Volume } from "memfs";
import { IFileSystemManager, IFileSystemManagerFactory, IFileSystemManagerParams } from "./definitions";

export class NodeFsManagerFactory implements IFileSystemManagerFactory {
    public create(params?: IFileSystemManagerParams): IFileSystemManager {
        return fs;
    }
}

export class MemFsManagerFactory implements IFileSystemManagerFactory {
    public readonly volume = new Volume();
    public create(params?: IFileSystemManagerParams): IFileSystemManager {
        return (this.volume as unknown) as IFileSystemManager;
    }
}
