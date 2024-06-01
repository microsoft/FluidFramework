/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DataVisualization,
	type FluidObjectTreeNode,
	type FluidObjectValueNode,
	type FluidUnknownObjectNode,
	GetDataVisualization,
	type IDevtoolsMessage,
	type UnknownObjectNode,
	VisualNodeKind,
} from "@fluidframework/devtools-core/internal";
// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";

import { MessageRelayContext } from "../MessageRelayContext.js";
import { FluidTreeView, UnknownDataView, UnknownFluidObjectView } from "../components/index.js";
import { MockMessageRelay } from "./utils/index.js";

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
			fluidObjectId: testFluidObjectId,
			children: {
				"test-string": {
					value: "Hello world",
					typeMetadata: "string",
					nodeKind: VisualNodeKind.ValueNode,
				},
			},
			nodeKind: VisualNodeKind.FluidTreeNode,
		};

		render(
			<MessageRelayContext.Provider value={messageRelay}>
				<FluidTreeView containerKey={testContainerKey} label={testLabel} node={treeData} />,
			</MessageRelayContext.Provider>,
		);

		// Will throw if matches are not found
		await screen.findByText(testLabel);
	});

	// TODO: Add interactive tests
});
