/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IDocumentDeltaConnection, IResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { IClient } from "@microsoft/fluid-protocol-definitions";
import { CreationDocumentServiceFactory } from "../creationDocumentServiceFactory";

describe("Creation Driver", () => {

    let documentDeltaConnection: IDocumentDeltaConnection;
    beforeEach(async () => {
        const factory = new CreationDocumentServiceFactory("docId", "tenantId");
        const resolved: IResolvedUrl = {endpoints: {}, type: "fluid", url: "", tokens: {}};
        const service = await factory.createDocumentService(resolved);
        const client: IClient = {
            mode: "write",
            details: {capabilities: {interactive: false}},
            permission: ["write"],
            scopes: ["write"],
            user: {id: "user1"},
        };
        documentDeltaConnection = await service.connectToDeltaStream(client, "write");
    });

    it("Initial driver connection details", async () => {
        assert.equal(documentDeltaConnection.mode, "write", "Connection mode should be write.");
        assert.equal(documentDeltaConnection.existing, false, "Document should not be existing.");
        assert.equal(documentDeltaConnection.initialMessages?.length, 1, "Join message should be fired.");
    });
});
