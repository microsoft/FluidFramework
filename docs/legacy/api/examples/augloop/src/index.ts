/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as winston from "winston";
import * as augLoop from "./launcher";

async function run(): Promise<void> {
    augLoop.launch();
}

run().catch((error) => {
    winston.error(error);
});
