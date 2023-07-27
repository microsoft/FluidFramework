/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeHeader } from "../../components/data-visualization/TreeHeader";
import { testContextDecorator } from "./ScreenshotTestUtilities";

export default {
	title: "TreeHeader",
	component: TreeHeader,
	decorators: [testContextDecorator],
};

/**
 * {@link TreeHeader} with no metadata.
 */
export const Simple = {
	args: {
		label: "Hello world!",
	},
};

/**
 * {@link TreeHeader} with metadata and inline text.
 */
export const Complex = {
	args: {
		label: "foo",
		metadata: "Bar",
		inlineValue: "BAZ",
	},
};
