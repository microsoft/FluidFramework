/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as util from "util";
import nconf from "nconf";
import rimrafCallback from "rimraf";
import { IStorageDirectoryConfig } from "../utils";

export type gitLibType = "nodegit" | "isomorphic-git";
export interface ITestMode {
    name: string;
    gitLibrary: gitLibType;
    repoPerDocEnabled: boolean;
}

export const defaultProvider = new nconf.Provider({}).use("memory").defaults({
    logger: {
        colorize: true,
        json: false,
        level: "info",
        morganFormat: "dev",
        timestamp: true,
    },
    storageDir: {
        baseDir: "/tmp/historian",
        useRepoOwner: true,
    },
    externalStorage: {
        enabled: false,
        endpoint: "http://localhost:3005",
    },
});

const rimraf = util.promisify(rimrafCallback);

export function initializeBeforeAfterTestHooks(provider: nconf.Provider) {
    afterEach(async () => {
        const storageDirConfig: IStorageDirectoryConfig = provider.get("storageDir");
        return rimraf(storageDirConfig.baseDir);
    });
}
