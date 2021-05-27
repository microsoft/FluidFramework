/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { SharedMap } from "@fluid-experimental/fluid-framework";
import { ContainerSchema } from "@fluid-experimental/fluid-static";
import {
    TinyliciousClient,
    TinyliciousConnectionConfig,
    TinyliciousContainerConfig,
} from "..";

describe("TinyliciousClient", () => {
    before(() => {
        const clientConfig: TinyliciousConnectionConfig = { port: 7070 };
        TinyliciousClient.init(clientConfig);
    });

    let documentId: string;
    beforeEach(() => {
        documentId = uuid();
    });

    it("can create a container successfully", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };

        const [container] = await TinyliciousClient.createContainer(containerConfig, schema);

        await new Promise<void>((resolve, reject) => {
            container.on("connected", () => {
                resolve();
            });
        });

        assert.notEqual(container.clientId, undefined, "container has a clientId");
    });
});
