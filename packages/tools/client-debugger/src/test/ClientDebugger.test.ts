/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { SharedCounter } from "@fluidframework/counter";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import {
    TinyliciousClient,
    TinyliciousContainerServices,
} from "@fluidframework/tinylicious-client";

import {
    clearDebuggerRegistry,
    closeFluidClientDebugger,
    getDebuggerRegistry,
    initializeFluidClientDebugger,
} from "../ClientDebugger";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

/**
 * Type returned from when creating / loading the Container.
 */
interface ContainerLoadResult {
    container: IFluidContainer;
    services: TinyliciousContainerServices;
}

/**
 * Schema used by the app.
 */
const containerSchema: ContainerSchema = {
    initialObjects: {
        counter: SharedCounter,
    },
};

describe("ClientDebugger unit tests", () => {
    let containerId: string | undefined;
    let tinyliciousContainer: IFluidContainer | undefined;
    let tinyliciousServices: TinyliciousContainerServices | undefined;

    beforeEach(async () => {
        const client = new TinyliciousClient();

        // Create the container
        console.log("Creating new container...");
        let createContainerResult: ContainerLoadResult;
        try {
            createContainerResult = await client.createContainer(containerSchema);
        } catch (error) {
            console.error(`Encountered error creating Fluid container: "${error}".`);
            throw error;
        }
        console.log("Container created!");

        ({ container: tinyliciousContainer, services: tinyliciousServices } =
            createContainerResult);

        // Attach container
        console.log("Awaiting container attach...");
        try {
            containerId = await tinyliciousContainer.attach();
        } catch (error) {
            console.error(`Encountered error attaching Fluid container: "${error}".`);
            throw error;
        }
        console.log("Fluid container attached!");
    });

    afterEach(() => {
        clearDebuggerRegistry();
    });

    it("Initializing debugger populates global (window) registry", () => {
        const { audience: tinyliciousAudience } = tinyliciousServices!;

        const container = tinyliciousContainer!._getRuntimeContainer!();
        const audience = tinyliciousAudience._getRuntimeAudience!();

        let debuggerRegistry = getDebuggerRegistry();
        expect(debuggerRegistry.size).to.equal(0); // There should be no registered debuggers yet.

        initializeFluidClientDebugger({ containerId: containerId!, container, audience });

        debuggerRegistry = getDebuggerRegistry();
        expect(debuggerRegistry.size).to.equal(1);
    });

    it("Closing debugger removes it from global (window) registry and disposes it.", () => {
        const { audience: tinyliciousAudience } = tinyliciousServices!;

        const container = tinyliciousContainer!._getRuntimeContainer!();
        const audience = tinyliciousAudience._getRuntimeAudience!();

        const clientDebugger = initializeFluidClientDebugger({
            containerId: containerId!,
            container,
            audience,
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(clientDebugger.disposed).to.be.false;

        let debuggerRegistry = getDebuggerRegistry();
        expect(debuggerRegistry.size).to.equal(1);

        closeFluidClientDebugger(containerId!);

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(clientDebugger.disposed).to.be.true;

        debuggerRegistry = getDebuggerRegistry();
        expect(debuggerRegistry.size).to.equal(0);
    });
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
