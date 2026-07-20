/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createDevtoolsLogger } from "@fluidframework/devtools/beta";
import { fireEvent, render } from "@testing-library/react";
import { independentView } from "fluid-framework/alpha";

import { App, type UserView, createInitialRoot, treeConfig } from "../app.js";

/**
 * Creates a TreeView for formatted text, initialized with the provided initial value.
 */
function createFormattedTreeView(initialValue = ""): UserView["treeView"] {
	const treeView = independentView(treeConfig);
	treeView.initialize(createInitialRoot(initialValue));
	return treeView;
}

/**
 * Creates a {@link UserView} for rendering {@link App} in tests without a Fluid service:
 * the tree is an in-memory `independentView` seeded with `initialValue` (no collaboration,
 * no network), and the container is a stub whose `dispose` is a no-op.
 * Use this instead of the app's real `connectUser`, which requires a running service.
 *
 * @param id - Distinguishes this user from others in the same test.
 * @param initialValue - The document text the user's view starts with.
 */
function createTestUserView(id: string, initialValue: string): UserView {
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
				initialUsers={[createTestUserView("a", "Text A"), createTestUserView("b", "Text B")]}
			/>
		);
		const rendered = render(content);
		assert.match(rendered.baseElement.textContent ?? "", /Text A/);
		assert.match(rendered.baseElement.textContent ?? "", /Text B/);
	});

	it("removes and adds users", async () => {
		const rendered = render(
			<App
				containerId="test"
				devtoolsLogger={createDevtoolsLogger()}
				initialUsers={[createTestUserView("a", "Text A"), createTestUserView("b", "Text B")]}
				connectUser={async () => createTestUserView("added", "Text of added user")}
			/>,
		);

		// Remove the second user; with one user left, removal is no longer offered.
		fireEvent.click(rendered.getByRole("button", { name: "Remove User 2" }));
		assert.doesNotMatch(rendered.baseElement.textContent ?? "", /Text B/);
		assert.match(rendered.baseElement.textContent ?? "", /Text A/);
		assert.equal(rendered.queryAllByRole("button", { name: /^Remove User/ }).length, 0);

		// Add a user: a new panel appears once the connection resolves.
		fireEvent.click(rendered.getByRole("button", { name: "+ Add user" }));
		await rendered.findByText("User 2");
		assert.match(rendered.baseElement.textContent ?? "", /Text of added user/);
	});

	// TODO: schema compatibility snapshot tests.
});
