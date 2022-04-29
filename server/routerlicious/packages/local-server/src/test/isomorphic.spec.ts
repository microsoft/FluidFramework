/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import webpack from "webpack";
import config from "../../webpack.config.js";

describe("Local server", () => {
    it("Isomorphic check - webpack build", async () => {
        return new Promise((resolve, reject) => {
            webpack(config, (err, stats) => {
                if (err) {
                    assert.fail(err);
                    reject(new Error());
                } else if (stats.hasErrors()) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    assert.fail(stats.compilation.errors.map((value) => value.stack).join("\n"));
                    reject(new Error());
                } else {
                    resolve();
                }
            });
        });
    }).timeout(20000);
});
