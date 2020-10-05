/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { run } from "hotloop";

(async () => {
    console.group("Populated");
    await run([
        { path: "./src/bench" },
    ]);
    console.groupEnd();
})();
