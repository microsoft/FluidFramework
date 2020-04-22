/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { generateStrings } from "./generateSharedStrings";

const filename: string = "src/test/sequenceTestSnapshot";
let i = 1;
for (const s of generateStrings()) {
    fs.writeFileSync(`${filename}${i++}.json`, JSON.stringify(s.snapshot(), undefined, 1));
}
