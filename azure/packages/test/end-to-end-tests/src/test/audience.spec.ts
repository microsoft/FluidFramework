/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { timeoutPromise } from "@fluidframework/test-utils";
import { AzureClient } from "@fluidframework/azure-client";
import { createAzureClient } from "./AzureClientFactory";
import { waitForMyself } from "./utils";

describe("Fluid audience", () => {
    const connectTimeoutMs = 1000;
    let client: AzureClient;
    let schema: ContainerSchema;

    beforeEach(() => {
        client = createAzureClient();
        schema = {
            initialObjects: {
                map1: SharedMap,
            },
        };
    });

    /**
     * Scenario: Find original member/self
     *
     * Expected behavior: container should have a single member upon creation.
     */
    it("can find original member", async () => {
        const { container, services } = await client.createContainer(schema);
        const containerId = await container.attach();

        await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
        assert.strictEqual(
            container.attachState,
            AttachState.Attached,
            "Container is not attached after attach is called",
        );

        /* This is a workaround for a known bug, we should have one member (self) upon container connection */
        const myself = await waitForMyself(services.audience);
        assert.notStrictEqual(myself, undefined, "We should have myself at this point.");

        const members = services.audience.getMembers();
        assert.strictEqual(members.size, 1, "We should have only one member at this point.");
    });

    /**
     * Scenario: Find partner member
     *
     * Expected behavior: upon resolving container, the partner member should be able
     * to resolve original member.
     */
    it("can find partner member", async () => {
        const { container, services } = await client.createContainer(schema);
        const containerId = await container.attach();

        await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
        assert.strictEqual(
            container.attachState,
            AttachState.Attached,
            "Container is not attached after attach is called",
        );

        /* This is a workaround for a known bug, we should have one member (self) upon container connection */
        const originalSelf = await waitForMyself(services.audience);
        assert.notStrictEqual(originalSelf, undefined, "We should have myself at this point.");

        const client2 = createAzureClient("test-id-2", "test-user-name-2");
        const { services: servicesGet } = await client2.getContainer(containerId, schema);

        const members = servicesGet.audience.getMembers();
        assert.strictEqual(members.size, 2, "We should have two members at this point.");

        const partner = servicesGet.audience.getMyself();
        assert.notStrictEqual(partner, undefined, "We should have other-self at this point.");

        assert.notStrictEqual(
            partner?.userId,
            originalSelf?.userId,
            "Self and partner should have different IDs",
        );
    });

    /**
     * Scenario: Partner should be able to observe change in audience
     *
     * Expected behavior: upon 1 partner leaving, other parther should observe
     * memberRemoved event and have correct partner count.
     */
    it("can observe member leaving", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        const client2 = createAzureClient("test-id-2", "test-user-name-2");
        const { services: servicesGet } = await client2.getContainer(containerId, schema);

        let members = servicesGet.audience.getMembers();
        assert.strictEqual(members.size, 2, "We should have two members at this point.");

        container.disconnect();

        await new Promise<void>((resolve) => {
            servicesGet.audience.on("memberRemoved", () => {
                resolve();
            });
        });

        members = servicesGet.audience.getMembers();
        assert.strictEqual(members.size, 1, "We should have one member left at this point.");
    });
});
