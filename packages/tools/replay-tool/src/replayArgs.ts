/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base class for replay tool arguments
 */
export class ReplayArgs {
    public inDirName?: string;
    public outDirName: string = "output";
    public from: number = 0;
    public to: number = Number.MAX_SAFE_INTEGER;
    public snapFreq: number | undefined;
    public fromVersion?: string;
    public verbose = true;
    public overlappingContainers = 1;
    public validateStorageSnapshots = false;
    public initializeFromSnapshotsDir: string | undefined;
    public windiff = false;
    public incremental = false;
    public compare = false;
    public write = false;
    public expandFiles = true;
    public testSummaries = false;
    public strictChannels = false;

    public checkArgs() {
        if (this.from > this.to) {
            throw new Error(`ERROR: --from argument should be less or equal to --to argument`);
        }
    }
}
