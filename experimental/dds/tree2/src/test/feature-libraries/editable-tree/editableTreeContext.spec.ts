/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AllowedUpdateType } from "../../../core";
import { isEditableTree } from "../../../feature-libraries";
import { createSharedTreeView } from "../../../shared-tree";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { ProxyContext } from "../../../feature-libraries/editable-tree/editableTreeContext";

import { fullSchemaData, personData } from "./mockData";

describe("editable-tree context", () => {
	it("can free anchors", () => {
		const view = createSharedTreeView().schematize({
			schema: fullSchemaData,
			initialTree: personData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});
		const context = view.context;
		assert(isEditableTree(view.root));

		// reify some EditableTrees
		const _1 = view.root.age;
		const withAnchorsBefore = (context as ProxyContext).withAnchors.size;
		delete view.root.age;
		view.context.free();
		const withAnchorsAfter = (context as ProxyContext).withAnchors.size;
		assert(withAnchorsBefore > withAnchorsAfter);
	});

	it("can create fields while clearing the context in afterHandlers", () => {
		const view = createSharedTreeView().schematize({
			schema: fullSchemaData,
			initialTree: personData,
			allowedSchemaModifications: AllowedUpdateType.None,
		});

		view.context.on("afterChange", () => {
			view.context.clear();
		});

		assert(isEditableTree(view.root));
		assert.equal(view.root.age, 35);
		delete view.root.age;
		assert.equal(view.root.age, undefined);
		view.root.age = 55;
		assert.equal(view.root.age, 55);
	});
});
