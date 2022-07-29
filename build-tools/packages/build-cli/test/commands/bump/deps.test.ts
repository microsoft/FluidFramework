/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@oclif/test";

describe("deps", () => {
    test.stderr().command(["bump:deps"]).exit(5).it("exits with code 5");
});
