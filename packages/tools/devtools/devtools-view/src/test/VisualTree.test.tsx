/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type IDevtoolsMessage,
	GetDataVisualization,
	DataVisualization,
	type FluidObjectValueNode,
	type FluidObjectTreeNode,
	type FluidUnknownObjectNode,
	type UnknownObjectNode,
	VisualNodeKind,
} from "@fluid-experimental/devtools-core";
import { UnknownDataView, FluidTreeView, UnknownFluidObjectView } from "../components";
import { MessageRelayContext } from "../MessageRelayContext";
import { MockMessageRelay } from "./MockMessageRelay";

const testContainerKey = "test-container-key";
const testFluidObjectId = "test-fluid-object-id";
const testLabel = "test-node-key";

describe("VisualTreeView component tests", () => {
	it("UnknownDataView", async (): Promise<void> => {
		const input: UnknownObjectNode = {
			nodeKind: VisualNodeKind.UnknownObjectNode,
		};

		render(<UnknownDataView label="test-label" node={input} />);

		await screen.findByText(/Unrecognized kind of data./); // Will throw if exact text not found
	});

	it("UnknownFluidObjectView", async (): Promise<void> => {
		const input: FluidUnknownObjectNode = {
			fluidObjectId: testFluidObjectId,
			typeMetadata: "test-fluid-object-type",
			nodeKind: VisualNodeKind.FluidUnknownObjectNode,
		};

		render(<UnknownFluidObjectView label="test-label" node={input} />);

		await screen.findByText(/Unrecognized kind of Fluid Object./); // Will throw if exact text not found
	});

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
							containerKey: testContainerKey,
							visualization,
						},
					};
				}
				default: {
					throw new Error("Received unexpected message.");
				}
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
					fluidObjectId: testFluidObjectId,
					typeMetadata: "Fluid Handle",
					nodeKind: VisualNodeKind.FluidHandleNode,
				},
			},
			nodeKind: VisualNodeKind.FluidTreeNode,
		};

		render(
			<MessageRelayContext.Provider value={messageRelay}>
				<FluidTreeView containerKey={testContainerKey} label={testLabel} node={treeData} />,
			</MessageRelayContext.Provider>,
		);

		// TODO: Loop the expand button for n-amount of times.
		const expandButton = await screen.findByTestId("tree-button");
		await userEvent.click(expandButton);

		await screen.findByText(/test-node-key/);

		// TODO: Add test support for complex container DDS.
		// await screen.findByText(/1/);
		// await screen.findByText(/2/);
		// await screen.findByText(/true/);
	});
});
