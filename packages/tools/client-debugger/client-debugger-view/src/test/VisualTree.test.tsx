/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "assert";
import React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	IDevtoolsMessage,
	GetDataVisualization,
	DataVisualization,
	FluidObjectValueNode,
	FluidObjectTreeNode,
	UnknownObjectNode,
	VisualNodeKind,
} from "@fluid-tools/client-debugger";
import { UnknownDataView, FluidTreeView } from "../components";
import { MessageRelayContext } from "../MessageRelayContext";
import { MockMessageRelay } from "./MockMessageRelay";

const CONTAINERID = "test-container-id";

describe("VisualTreeView component tests", () => {
	// eslint-disable-next-line jest/expect-expect
	it("UnknownDataView", async (): Promise<void> => {
		const input: UnknownObjectNode = {
			nodeKind: VisualNodeKind.UnknownObjectNode,
		};

		render(<UnknownDataView node={input} />);

		await screen.findByText(/Encountered an unrecognized kind of data object/); // Will throw if exact text not found
	});

	// eslint-disable-next-line jest/expect-expect
	it("FluidObjectTreeView", async (): Promise<void> => {
		const messageRelay = new MockMessageRelay((untypedMessage: IDevtoolsMessage) => {
			switch (untypedMessage.type) {
				case GetDataVisualization.MessageType: {
					const message = untypedMessage as GetDataVisualization.Message;
					const visualization: FluidObjectValueNode = {
						fluidObjectId: message.data.fluidObjectId,
						value: `test-value: ${message.data.fluidObjectId}`,
						nodeKind: VisualNodeKind.FluidValueNode,
					};
					return {
						type: DataVisualization.MessageType,
						data: {
							CONTAINERID,
							visualization,
						},
					};
				}
				default:
					fail("Received unexpected message.");
			}
		});

		const treeData: FluidObjectTreeNode = {
			fluidObjectId: "test-object",
			children: {
				"test-string": {
					value: "Hello world",
					typeMetadata: "string",
					nodeKind: VisualNodeKind.ValueNode,
				},
				"test-tree-node": {
					children: {
						a: {
							value: 1,
							typeMetadata: "number",
							nodeKind: VisualNodeKind.ValueNode,
						},
						b: {
							value: "2",
							typeMetadata: "string",
							nodeKind: VisualNodeKind.ValueNode,
						},
						c: {
							value: true,
							typeMetadata: "boolean",
							nodeKind: VisualNodeKind.ValueNode,
						},
					},
					typeMetadata: "object",
					nodeKind: VisualNodeKind.TreeNode,
				},
				"test-handle": {
					fluidObjectId: CONTAINERID,
					typeMetadata: "Fluid Handle",
					nodeKind: VisualNodeKind.FluidHandleNode,
				},
			},
			nodeKind: VisualNodeKind.FluidTreeNode,
		};

		render(
			<MessageRelayContext.Provider value={messageRelay}>
				<FluidTreeView containerId={CONTAINERID} node={treeData} />,
			</MessageRelayContext.Provider>,
		);

		// TODO: Loop the expand button for n-amount of times.
		const expandButton = await screen.findByTestId("expand-button");
		await userEvent.click(expandButton);

		await screen.findByText(/Hello world/);

		// TODO: Add test support for complex container DDS.
		// await screen.findByText(/1/);
		// await screen.findByText(/2/);
		// await screen.findByText(/true/);
	});
});
