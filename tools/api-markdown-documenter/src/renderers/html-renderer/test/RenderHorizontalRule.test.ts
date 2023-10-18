/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { HorizontalRuleNode } from "../../../documentation-domain";
import { testRender } from "./Utilities";

it("HorizontalRule HTML rendering test", () => {
	expect(testRender(HorizontalRuleNode.Singleton)).to.equal("<hr>\n");
});
