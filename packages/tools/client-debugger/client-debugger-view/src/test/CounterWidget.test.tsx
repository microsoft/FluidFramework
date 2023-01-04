/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { SharedCounter } from "@fluidframework/counter";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

import { createFluidContainer } from "./ClientUtilities";
import { CounterWidget } from "./widgets";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe("CounterWidget component tests", () => {
    let client: TinyliciousClient | undefined;
    let container: IFluidContainer | undefined;
    let sharedCounter: SharedCounter | undefined;

    const containerSchema: ContainerSchema = {
        initialObjects: {
            counter: SharedCounter,
        },
    };

    beforeEach(async () => {
        client = new TinyliciousClient();
        ({ container } = await createFluidContainer(client, containerSchema));
        sharedCounter = await container.create(SharedCounter);
    });

    afterEach(() => {
        container!.dispose();
        container = undefined;
        client = undefined;
        sharedCounter = undefined;
    });

    it("Has expected elements", async (): Promise<void> => {
        render(<CounterWidget counter={sharedCounter!} />);

        // Verify initial component text presence and value
        await screen.findByText("0"); // Will throw if exact text not found

        // Verify button presence and state
        const buttons = await screen.findAllByRole("button");
        expect(buttons).toHaveLength(2);
        expect(buttons[0]).toBeDisabled(); // Initial counter value is 0, so the decrement button should be disabled.
        expect(buttons[1]).toBeEnabled();
    });

    it("Responds to increment (via UI)", async (): Promise<void> => {
        render(<CounterWidget counter={sharedCounter!} />);

        let buttons = await screen.findAllByRole("button");
        expect(buttons).toHaveLength(2);

        // Click increment button
        await userEvent.click(buttons[1]);

        // Verify change in DDS
        expect(sharedCounter!.value).toEqual(1); // Value should have been incremented from 0 to 1

        // Verify component text
        await screen.findByText("1"); // Will throw if exact text not found

        // Verify that decrement button is now enabled
        buttons = await screen.findAllByRole("button");
        expect(buttons).toHaveLength(2);
        expect(buttons[0]).toBeEnabled();
    });
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
