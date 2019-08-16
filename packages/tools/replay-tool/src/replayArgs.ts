/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
    public snapFreq: number = Number.MAX_SAFE_INTEGER;
    public version?: string;
    public verbose = true;
    public overlappingContainers = 4;
    public validateStorageSnapshots = false;
    public windiff = false;
    public incremental = false;
    public compare = false;
    public write = false;
    public expandFiles = true;

    public checkArgs() {
        if (this.from > this.to) {
            throw new Error(`ERROR: --from argument should be less or equal to --to argument`);
        }

        if (this.from !== 0 && this.snapFreq === Number.MAX_SAFE_INTEGER) {
            console.error(`WARNING: --from argument has no effect without --snapfreq`);
        }
    }
}
