/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// PreviewJS doesn't handle roll-up modules correctly. Must import directly from component module.
import { Waiting } from "../../components/Waiting";
import { testContextDecorator } from "../ScreenshotTestUtilities";

export default {
	title: "Waiting",
	component: Waiting,
	decorators: [testContextDecorator],
};

/**
 * {@link Waiting} with no label provided.
 */
export const DefaultLabel = {
	args: {},
};

/**
 * {@link Waiting} with a custom label provided.
 */
export const CustomLabel = {
	args: {
		label: "Test label 😀",
	},
};
