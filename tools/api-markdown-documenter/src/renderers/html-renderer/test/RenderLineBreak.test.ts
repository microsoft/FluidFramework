/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { LineBreakNode } from "../../../documentation-domain";
import { testRender } from "./Utilities";

it("LineBreak HTML rendering test", () => {
	expect(testRender(LineBreakNode.Singleton)).to.equal("<br>\n");
});
