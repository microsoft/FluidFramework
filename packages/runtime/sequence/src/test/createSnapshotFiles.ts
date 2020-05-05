/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { generateStrings, LocationBase } from "./generateSharedStrings";

for (const s of generateStrings()) {
    fs.writeFileSync(`${LocationBase}${s[0]}.json`, JSON.stringify(s[1].snapshot(), undefined, 1));
}
