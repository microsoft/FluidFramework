/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import { parseJSON } from "date-fns";
import { sortVersions, VersionDetails } from "../src/lib/package";

const data: VersionDetails[] = [
    { version: "0.1.38773", date: parseJSON("2021-09-28T17:03:10.000Z") },
    { version: "0.59.3000", date: parseJSON("2022-06-06T21:35:27.000Z") },
    { version: "0.59.3001", date: parseJSON("2022-08-13T21:35:27.000Z") },
    { version: "1.0.0", date: parseJSON("2022-06-16T18:03:37.000Z") },
    { version: "1.0.1", date: parseJSON("2022-06-23T01:59:04.000Z") },
    { version: "1.0.2", date: parseJSON("2022-08-12T03:03:21.000Z") },
];

describe("VersionDetails sorting", async () => {
    const versions = data;

    it("sortedByVersion", async () => {
        const sortedByVersion = await sortVersions(versions, "version");
        assert.equal(sortedByVersion[0].version, "1.0.2");
        assert.equal(sortedByVersion[3].version, "0.59.3001");
    });

    it("sortedByDate", async () => {
        const sortedByDate = await sortVersions(versions, "date");
        assert.equal(sortedByDate[0].version, "0.59.3001");
        assert.equal(sortedByDate[1].version, "1.0.2");
        assert.equal(sortedByDate[4].version, "0.59.3000");
    });
});
