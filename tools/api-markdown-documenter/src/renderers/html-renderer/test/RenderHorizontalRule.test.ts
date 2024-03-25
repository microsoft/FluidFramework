/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { HorizontalRuleNode } from "../../../documentation-domain/index.js";
import { testRender } from "./Utilities.js";

it("HorizontalRule HTML rendering test", () => {
	expect(testRender(HorizontalRuleNode.Singleton)).to.equal("<hr>\n");
});
