/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { SharedMap, ContainerSchema } from "fluid-framework";
import {
    FrsContainerConfig,
} from "..";
import { createFrsClient } from "./FrsClientFactory";

describe("FrsClient", () => {
    const client = createFrsClient();
    let documentId: string;
    beforeEach(() => {
        documentId = uuid();
    });

    it("can create FRS container successfully", async () => {
        const containerConfig: FrsContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };

        const containerAndServices  = await client.createContainer(containerConfig, schema);

        await assert.doesNotReject(
            Promise.resolve(containerAndServices),
            () => true,
            "container cannot be created in FRS",
        );
    });
});
