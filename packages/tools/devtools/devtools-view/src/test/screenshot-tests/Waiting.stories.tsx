/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { Waiting } from "../../components/Waiting";
import { ThemeDecorators } from "./ScreenshotTestUtilities";

export default {
	title: "Waiting",
	component: Waiting,
	decorators: [
		(story: () => React.ReactElement): React.ReactElement => (
			<ThemeDecorators>{story()}</ThemeDecorators>
		),
	],
};

/**
 * Waiting component with no label provided.
 */
export const DefaultLabel = {
	args: {},
};

/**
 * Waiting component with an explicit, custom label provided.
 */
export const CustomLabel = {
	args: {
		label: "Test label 😀",
	},
};
