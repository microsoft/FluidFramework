/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as util from "util";
import nconf from "nconf";
import rimrafCallback from "rimraf";

export const defaultProvider = new nconf.Provider({}).defaults({
    logger: {
        colorize: true,
        json: false,
        level: "info",
        morganFormat: "dev",
        timestamp: true,
    },
    storageDir: "/tmp/historian",
    externalStorage: {
        enabled: false,
        endpoint: "http://localhost:3005",
    },
});

const rimraf = util.promisify(rimrafCallback);

export function initializeBeforeAfterTestHooks(provider: nconf.Provider) {
    afterEach(async () => {
        return rimraf(provider.get("storageDir"));
    });
}
