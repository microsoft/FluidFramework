/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree, type TreeView } from "@fluidframework/tree/internal";
import { render } from "@testing-library/react";
import { TextAsTree, independentView } from "fluid-framework/alpha";
import * as React from "react";

import { App, TextEditorRoot, treeConfig } from "../app.js";

/**
 * Creates a TreeView for formatted text, initialized with the provided initial value.
 */
function createFormattedTreeView(initialValue = ""): TreeView<typeof TextEditorRoot> {
	const treeView = independentView(treeConfig);
	treeView.initialize(
		new TextEditorRoot({
			plainText: TextAsTree.Tree.fromString(initialValue),
			formattedText: FormattedTextAsTree.Tree.fromString(initialValue),
		}),
	);
	return treeView;
}

// TODO add collaboration tests when rich formatting is supported using TestContainerRuntimeFactory from
// @fluidframework/test-utils to test rich formatting data sync between multiple collaborators
describe("app", () => {
	it("renders MainView", () => {
		const content = (
			<App
				views={{
					user1: createFormattedTreeView("Text A"),
					user2: createFormattedTreeView("Text B"),
					containerId: "test",
				}}
			/>
		);
		const rendered = render(content);
		assert.match(rendered.baseElement.textContent ?? "", /Text A/);
		assert.match(rendered.baseElement.textContent ?? "", /Text B/);
	});

	// TODO: schema compatibility snapshot tests.
});
