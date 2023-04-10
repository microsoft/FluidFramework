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
	FluidObjectTreeNode,
	UnknownObjectNode,
	VisualNodeKind,
} from "@fluid-tools/client-debugger";
import { SharedCounter } from "@fluidframework/counter";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

// eslint-disable-next-line import/no-internal-modules
import { UnknownDataView } from "../components/UnknownDataView";
// eslint-disable-next-line import/no-internal-modules
import { FluidTreeView } from "../components/FluidTreeView";

describe("VisualTreeView component tests", () => {
	// eslint-disable-next-line jest/expect-expect
	it("UnknownDataView", async (): Promise<void> => {
		const input: UnknownObjectNode = {
			nodeKind: VisualNodeKind.UnknownObjectNode,
		};

		render(<UnknownDataView containerId={"foo"} node={input} />);

		await screen.findByText(/Encountered an unrecognized kind of data object/); // Will throw if exact text not found
	});

	// eslint-disable-next-line jest/expect-expect
	it("FluidObjectTreeView", async (): Promise<void> => {
		const runtime = new MockFluidDataStoreRuntime();

		const sharedCounter = new SharedCounter(
			"test-counter",
			runtime,
			SharedCounter.getFactory().attributes,
		);

		const treeData: FluidObjectTreeNode = {
			fluidObjectId: "test-object",
			children: {
				"test-string": {
					value: "Hello world",
					typeMetadata: "string",
					nodeKind: VisualNodeKind.ValueNode,
				},
				// "test-tree-node": {
				// 	children: {
				// 		a: {
				// 			value: 1,
				// 			typeMetadata: "number",
				// 			nodeKind: VisualNodeKind.ValueNode,
				// 		},
				// 		b: {
				// 			value: "2",
				// 			typeMetadata: "string",
				// 			nodeKind: VisualNodeKind.ValueNode,
				// 		},
				// 		c: {
				// 			value: true,
				// 			typeMetadata: "boolean",
				// 			nodeKind: VisualNodeKind.ValueNode,
				// 		},
				// 	},
				// 	typeMetadata: "object",
				// 	nodeKind: VisualNodeKind.TreeNode,
				// },
				// "test-handle": {
				// 	fluidObjectId: sharedCounter.id,
				// 	typeMetadata: "Fluid Handle",
				// 	nodeKind: VisualNodeKind.FluidHandleNode,
				// },
			},
			nodeKind: VisualNodeKind.FluidTreeNode,
		};

		render(<FluidTreeView containerId={sharedCounter.id} node={treeData} />);

		// Expand the first level
		const expandButton = await screen.findByTestId("expand-button");
		await userEvent.click(expandButton);

		await screen.findByText(/Hello world/);

		// await screen.findByText(/test-tree-node/);
		// await screen.findByText(/1/);
		// await screen.findByText(/2/);
		// await screen.findByText(/true/);
	});
});
