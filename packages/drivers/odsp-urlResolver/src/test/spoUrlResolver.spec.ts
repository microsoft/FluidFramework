/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver";
import { OdspUrlResolver } from "../urlResolver";

describe("Spo Url Resolver", () => {
    it("Should resolve the spo urls correctly", async () => {
        const urlResolver = new OdspUrlResolver();
        const url: string = "https://microsoft-my.sharepoint-df.com/_api/v2.1/drives/randomDrive/items/randomItem";
        const resolved = (await urlResolver.resolve({ url })) as IOdspResolvedUrl;
        assert.equal(resolved.driveId, "randomDrive", "Drive id does not match");
        assert.equal(resolved.itemId, "randomItem", "Item id does not match");
        assert.equal(resolved.siteUrl, url, "Site id does not match");
        assert.equal(resolved.endpoints.snapshotStorageUrl,
            `${url}/opStream/snapshots`, "SnashotStorageUrl does not match");
        assert.equal(resolved.url,
            // eslint-disable-next-line max-len
            `fluid-odsp://placeholder/placeholder/${resolved.hashedDocumentId}/?driveId=${resolved.driveId}&itemId=${resolved.itemId}&path=`, "fluid url does not match");
    });

    it("Should resolve the other tenant spo url correctly", async () => {
        const urlResolver = new OdspUrlResolver();
        const url: string = "https://random.sharepoint.com/_api/v2.1/drives/randomDrive/items/randomItem";
        const resolved = (await urlResolver.resolve({ url })) as IOdspResolvedUrl;
        assert.equal(resolved.driveId, "randomDrive", "Drive id does not match");
        assert.equal(resolved.itemId, "randomItem", "Item id does not match");
        assert.equal(resolved.siteUrl, url, "Site id does not match");
        assert.equal(resolved.endpoints.snapshotStorageUrl,
            `${url}/opStream/snapshots`, "SnashotStorageUrl does not match");
        assert.equal(resolved.url,
            // eslint-disable-next-line max-len
            `fluid-odsp://placeholder/placeholder/${resolved.hashedDocumentId}/?driveId=${resolved.driveId}&itemId=${resolved.itemId}&path=`, "fluid url does not match");
    });
});
