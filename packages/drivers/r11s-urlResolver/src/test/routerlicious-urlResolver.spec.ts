/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
import { RouterliciousUrlResolver } from "../urlResolver";

describe("Routerlicious Url Resolver", () => {

    const token = "dummy";
    it("Should resolve the Routerlicious urls correctly", async () => {
        const urlResolver = new RouterliciousUrlResolver(undefined, token, []);
        const url: string = "https://www.wu2.prague.office-int.com/loader/fluid/thinkable-list?chaincode=@fluid-example/shared-text@0.11.14146";
        const resolved = (await urlResolver.resolve({ url })) as IFluidResolvedUrl;
        assert.equal(resolved.tokens.jwt, token, "Token does not match");
        assert.equal(resolved.endpoints.storageUrl, "https://historian.wu2.prague.office-int.com/repos/fluid", "Storage url does not match");
        assert.equal(resolved.endpoints.deltaStorageUrl, "https://alfred.wu2.prague.office-int.com/deltas/fluid/thinkable-list", "Delta storage url does not match");
        assert.equal(resolved.endpoints.ordererUrl, "https://alfred.wu2.prague.office-int.com", "Orderer url does not match");
        assert.equal(resolved.url, "fluid://wu2.prague.office-int.com/fluid/thinkable-list", "FluidUrl does not match");
    });
});
