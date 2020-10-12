/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { run } from "hotloop";

(async () => {
    console.group("Populated");
    await run([
        { path: "./src/array-sum", args: { count: 256 * 256 }},
        { path: "./src/log-sum", args: { count: 256 * 256 } },
    ]);
    console.groupEnd();
})();
