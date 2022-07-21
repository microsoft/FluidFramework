/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test } from "@oclif/test";

describe("bump", () => {
    test.stdout().command(["bump"]).exit(2).it("exits with code 2");
});
