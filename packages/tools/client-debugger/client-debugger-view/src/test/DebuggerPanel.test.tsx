/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import React from "react";

import { SharedString } from "@fluidframework/sequence";
import { CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";
import { render, screen } from "@testing-library/react";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import userEvent from "@testing-library/user-event";

describe("SharedString component tests", () => {
    let sharedString: SharedString | undefined;

    beforeEach(async () => {
        sharedString = new SharedString(
            new MockFluidDataStoreRuntime(),
            "shared-text",
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            (SharedString.getFactory() as any).attributes,
        )
    })

    it("Has expected elements", async (): Promise<void> => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        render(<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(sharedString!)} />);

        await screen.findAllByText("Enter text here.");

        const textArea = await screen.findAllByRole("text-area");
        expect(textArea).toHaveLength(1);
        expect(textArea[0]).toBeEnabled();
    });

    it("Respond to input text (via UI)", async (): Promise<void> => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        render(<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(sharedString!)} />);

        await screen.findAllByText("Enter text here.");

        let textArea = await screen.findAllByRole("text-area");
        expect(textArea).toHaveLength(1);
        // Enter text in text-area
        await userEvent.type(textArea[0], "hello world");

        // Verify change in DDS
        expect(sharedString).toEqual("hello world");

        // Verify Component Text
        await screen.findByText("hello world");

        // Verify Backspacing works
        textArea = await screen.findAllByRole("text-area");
        await userEvent.type(textArea[0], "hello");
        expect(sharedString).toEqual("hello");
    });
})

