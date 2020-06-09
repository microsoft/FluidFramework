/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import webpack from "webpack";
import config from "../../webpack.config.js";

describe("Local server", () => {
    it("Isomorphic check - webpack build", async () => {
        return new Promise((resolve, reject) => {
            webpack(config, (err, stats) => {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (err) {
                    assert.fail(err);
                    reject();
                } else if (stats.hasErrors()) {
                    assert.fail(stats.compilation.errors.map((value) => value.stack).join("\n"));
                    reject();
                } else {
                    resolve();
                }
            });
        });
    }).timeout(20000);
});
