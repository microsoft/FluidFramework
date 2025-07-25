/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { HorizontalRuleNode } from "../../documentation-domain/index.js";
import { blockContentToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";

it("horizontalRuleToMarkdown", () => {
	const transformationContext = createTransformationContext({});
	const input = HorizontalRuleNode.Singleton;
	const result = blockContentToMarkdown(input, transformationContext);
	expect(result).to.deep.equal([{ type: "thematicBreak" }]);
});
