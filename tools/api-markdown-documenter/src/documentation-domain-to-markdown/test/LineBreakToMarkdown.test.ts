/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { LineBreakNode } from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import { createTransformationContext } from "../TransformationContext.js";

it("lineBreakToMarkdown", () => {
	const transformationContext = createTransformationContext({});
	const input = LineBreakNode.Singleton;
	const result = phrasingContentToMarkdown(input, transformationContext);
	expect(result).to.deep.equal([{ type: "break" }]);
});
