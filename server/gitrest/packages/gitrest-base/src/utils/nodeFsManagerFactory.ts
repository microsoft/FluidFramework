/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { IFileSystemManager, IFileSystemManagerFactory, IFileSystemManagerParams } from "./definitions";

export class NodeFsManagerFactory implements IFileSystemManagerFactory {
    public create(params?: IFileSystemManagerParams): IFileSystemManager {
        return fs;
    }
}
