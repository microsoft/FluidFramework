/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { isEditableTree } from "../../../feature-libraries";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { ProxyContext } from "../../../feature-libraries/editable-tree/editableTreeContext";

import { viewWithContent } from "../../utils";
import { fullSchemaData, personData } from "./mockData";

describe("editable-tree context", () => {
	it("can free anchors", () => {
		const view = viewWithContent({
			schema: fullSchemaData,
			initialTree: personData,
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
		const view = viewWithContent({
			schema: fullSchemaData,
			initialTree: personData,
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
