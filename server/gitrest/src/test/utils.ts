/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as nconf from "nconf";
import * as rimrafCallback from "rimraf";
import * as util from "util";

export const defaultProvider = new nconf.Provider({}).defaults({
    logger: {
        colorize: true,
        json: false,
        level: "info",
        morganFormat: "dev",
        timestamp: true,
    },
    storageDir: "/tmp/historian",
});

const rimraf = util.promisify(rimrafCallback) as (arg: string) => Promise<void>;

export function initializeBeforeAfterTestHooks(provider: nconf.Provider) {
    afterEach(() => {
        return rimraf(provider.get("storageDir"));
    });
}
