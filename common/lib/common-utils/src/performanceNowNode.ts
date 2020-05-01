/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const perfNow = require("performance-now") as (() => number);

export function performanceNow() {
    return perfNow();
}
