/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
// import userEvent from "@testing-library/user-event";
import React from "react";

import { UnknownObjectNode, VisualNodeKind } from "@fluid-tools/client-debugger";
// eslint-disable-next-line import/no-internal-modules
import { UnknownDataView } from "../components/UnknownDataView";

describe("VisualTreeView component tests", () => {
	// eslint-disable-next-line jest/expect-expect
	it("UnknownDataView", async (): Promise<void> => {
		const input: UnknownObjectNode = {
			nodeKind: VisualNodeKind.UnknownObjectNode,
		}

		render(<UnknownDataView node={input} />);

		await screen.findByText("TODO"); // Will throw if exact text not found
	});

	// TODO: 
	// it("FluidObjectTreeView", async (): Promise<void> => {
	// 	const input: FluidObjectTreeNode = {
	// 		fluidObjectId: "test-object",
	// 		children: {
	// 			// TODO
	// 		},
	// 		nodeKind: VisualNodeKind.FluidTreeNode,
	// 	}

	// 	render(<UnknownDataView node={input} />);

	// 	await screen.findByText("TODO"); // Will throw if exact text not found
	// 	// TODO: additional verifications
	// });
});
