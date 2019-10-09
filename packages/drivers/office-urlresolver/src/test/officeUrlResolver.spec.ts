/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: max-line-length
import { IOdspResolvedUrl } from "@microsoft/fluid-odsp-driver";
import * as assert from "assert";
import { OfficeUrlResolver } from "../urlResolver";

describe("Office Url Resolver", () => {

    it("Should resolve the office urls correctly", async () => {
        const urlResolver = new OfficeUrlResolver();
        const resolved = (await urlResolver.resolve({ url: "https://weuprodprv.www.office.com/content/bohemia?auth=2&drive=randomDrive&item=randomItem&file=randomFile.b&site=https://randomSite.com" })) as IOdspResolvedUrl;
        assert.equal(resolved.driveId, "randomDrive", "Drive id does not match");
        assert.equal(resolved.itemId, "randomItem", "Item id does not match");
        assert.equal(resolved.siteUrl, "https://randomSite.com", "Site id does not match");
        assert.equal(resolved.endpoints.snapshotStorageUrl, "https://randomsite.com/_api/v2.1/drives/randomDrive/items/randomItem/opStream/snapshots", "SnashotStorageUrl does not match");
        assert.equal(resolved.url, `fluid-odsp://placeholder/placeholder/${resolved.hashedDocumentId}?auth=2&drive=randomDrive&item=randomItem&file=randomFile.b&site=https://randomSite.com`, "fluid url does not match");
    });
});
