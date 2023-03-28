/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import React from "react";

import { ContainerMetadata, ISourcedDebuggerMessage } from "@fluid-tools/client-debugger";

import { DebuggerPanel } from "../DebuggerPanel";
import { MessageRelayContext } from "../MessageRelayContext";
import { TestMessageRelay } from "./TestMessageRelay";
import { testMessageSource } from "./Utilities";

// Container data returned in messages below
const containers = new Map<string, ContainerMetadata>([
	[
		"container-0",
		{
			id: "container-0",
			nickname: "test-container-0",
		},
	],
	[
		"container-1",
		{
			id: "container-1",
			nickname: "test-container-1",
		},
	],
]);

const messageHandlers = (message: ISourcedDebuggerMessage): ISourcedDebuggerMessage | undefined => {
	switch (message.type) {
		case "GET_CONTAINER_LIST": {
			return {
				type: "REGISTRY_CHANGE",
				source: testMessageSource,
				data: {
					containers: [...containers.values()],
				},
			};
		}
		default:
			console.warn(`Unexpected incoming message type: "${message.type}".`);
			break;
	}
};

/**
 * Sets up the required {@link MessageRelayContext}, and renders the {@link DebuggerPanel}.
 */
function DebuggerPanelWithContext(): React.ReactElement {
	return (
		<MessageRelayContext.Provider value={new TestMessageRelay(messageHandlers)}>
			<DebuggerPanel />
		</MessageRelayContext.Provider>
	);
}

describe("DebuggerPanel component tests", () => {
	it("Can render (smoke test)", async (): Promise<void> => {
		render(<DebuggerPanelWithContext />);
	});

	it("Responds to registry change", async (): Promise<void> => {
		render(<DebuggerPanelWithContext />);

		// Should initially display text indicating that it is waiting to get the list back from the registry
		await screen.findByText("Waiting for Container list.");

		// Await population of container selection drop-down.
		// Default selection should be container 0
		await screen.findByText("test-container-0");

		// Should initially display text indicating that it is waiting for container metadata
		await screen.findByText("Waiting for Container Summary data.");
	});
});
