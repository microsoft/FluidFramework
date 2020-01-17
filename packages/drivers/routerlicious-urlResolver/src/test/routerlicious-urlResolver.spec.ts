/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/filename-case, max-len */

import * as assert from "assert";
import { IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { RouterliciousUrlResolver } from "../urlResolver";

describe("Routerlicious Url Resolver", () => {

    const token = "dummy";
    it("Should resolve the Routerlicious urls correctly", async () => {
        const urlResolver = new RouterliciousUrlResolver(undefined, async () => Promise.resolve(token), []);
        const url: string = "https://www.wu2.prague.office-int.com/loader/fluid/thinkable-list?chaincode=@fluid-example/shared-text@0.11.14146";
        const resolved = (await urlResolver.resolve({ url })) as IFluidResolvedUrl;
        assert.equal(resolved.tokens.jwt, token, "Token does not match");
        assert.equal(resolved.endpoints.storageUrl, "https://historian.wu2.prague.office-int.com/repos/fluid", "Storage url does not match");
        assert.equal(resolved.endpoints.deltaStorageUrl, "https://alfred.wu2.prague.office-int.com/deltas/fluid/thinkable-list", "Delta storage url does not match");
        assert.equal(resolved.endpoints.ordererUrl, "https://alfred.wu2.prague.office-int.com", "Orderer url does not match");
        assert.equal(resolved.url, "fluid://wu2.prague.office-int.com/fluid/thinkable-list?chaincode=@fluid-example/shared-text@0.11.14146", "FluidUrl does not match");
    });

    it("Should resolve the localhost urls correctly", async () => {
        const urlResolver = new RouterliciousUrlResolver(undefined, async () => Promise.resolve(token), []);
        const url: string = "http://localhost:3000/loader/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0";
        const resolved = (await urlResolver.resolve({ url })) as IFluidResolvedUrl;
        assert.equal(resolved.tokens.jwt, token, "Token does not match");
        assert.equal(resolved.endpoints.storageUrl, "http://localhost:3001/repos/fluid", "Storage url does not match");
        assert.equal(resolved.endpoints.deltaStorageUrl, "http://localhost:3003/deltas/fluid/damp-competition", "Delta storage url does not match");
        assert.equal(resolved.endpoints.ordererUrl, "http://localhost:3003/", "Orderer url does not match");
        assert.equal(resolved.url, "fluid://localhost:3003/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0", "FluidUrl does not match");
    });
});
