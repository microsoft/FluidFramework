/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { FluidAppOdspUrlResolver } from "../urlResolver";

describe("Fluid App Url Resolver", () => {
    it("Should resolve the Fluid app urls correctly", async () => {
        const urlResolver = new FluidAppOdspUrlResolver();
        // eslint-disable-next-line max-len
        const resolved = (await urlResolver.resolve({ url: "https://dev.fluidpreview.office.net/p/c3BvOmh0dHBzOi8vbWljcm9zb2Z0LnNoYXJlcG9pbnQtZGYuY29tL3RlYW1zL09mZmljZU9ubGluZVByYWd1ZQ%3D%3D/randomDrive/randomItem/OXO-Dogfood-remaining-items?nav=&e=_Ha3TtNhQEaX-jy2yOQM3A&at=15&scriptVersion=3016031" })) as IOdspResolvedUrl;
        assert.equal(resolved.driveId,
            "randomDrive", "Drive id does not match");
        assert.equal(resolved.itemId, "randomItem", "Item id does not match");
        assert.equal(resolved.siteUrl,
            "https://microsoft.sharepoint-df.com/teams/OfficeOnlinePrague", "Site id does not match");
        // eslint-disable-next-line max-len
        assert.equal(resolved.endpoints.snapshotStorageUrl, "https://microsoft.sharepoint-df.com/_api/v2.1/drives/randomDrive/items/randomItem/opStream/snapshots", "SnashotStorageUrl does not match");
    });
});
