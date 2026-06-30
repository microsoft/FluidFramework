/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createDevtoolsLogger } from "@fluidframework/devtools/beta";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree, type TreeViewAlpha } from "@fluidframework/tree/internal";
import { render } from "@testing-library/react";
import { TextAsTree, independentView } from "fluid-framework/alpha";

import { App, TextEditorRoot, type UserView, treeConfig } from "../app.js";

/**
 * Creates a TreeView for formatted text, initialized with the provided initial value.
 */
function createFormattedTreeView(initialValue = ""): TreeViewAlpha<typeof TextEditorRoot> {
	const treeView = independentView(treeConfig);
	treeView.initialize(
		new TextEditorRoot({
			plainText: TextAsTree.Tree.fromString(initialValue),
			formattedText: FormattedTextAsTree.Tree.fromString(initialValue),
		}),
	);
	return treeView;
}

/**
 * Creates a {@link UserView}
 */
function createUserView(id: number, initialValue: string): UserView {
	return {
		id,
		container: { dispose: () => {} } as unknown as UserView["container"],
		treeView: createFormattedTreeView(initialValue),
	};
}

// TODO add collaboration tests when rich formatting is supported using TestContainerRuntimeFactory from
// @fluidframework/test-utils to test rich formatting data sync between multiple collaborators
describe("app", () => {
	it("renders MainView", () => {
		const content = (
			<App
				containerId="test"
				devtoolsLogger={createDevtoolsLogger()}
				initialUsers={[createUserView(1, "Text A"), createUserView(2, "Text B")]}
			/>
		);
		const rendered = render(content);
		assert.match(rendered.baseElement.textContent ?? "", /Text A/);
		assert.match(rendered.baseElement.textContent ?? "", /Text B/);
	});

	// TODO: schema compatibility snapshot tests.
});
