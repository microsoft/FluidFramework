/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base class for replay tool arguments
 */
export class ReplayArgs {
    public inDirName: string;
    public to: number = Number.MAX_SAFE_INTEGER;
    public verbose = false;
    public checkArgs() {
    }
}
