/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// PreviewJS doesn't handle roll-up modules correctly. Must import directly from component module.
import { AudienceHistoryTable } from "../../components/AudienceHistoryTable";
import { testContextDecorator } from "../ScreenshotTestUtilities";

export default {
	title: "AudienceHistoryTable",
	component: AudienceHistoryTable,
	decorators: [testContextDecorator],
};

/**
 * {@link AudienceHistoryTable} with an empty list of history items.
 */
export const EmptyList = {
	args: {
		audienceHistoryItems: [],
	},
};

/**
 * {@link AudienceHistoryTable} with a non-empty list of history items.
 */
export const NonEmptyList = {
	args: {
		audienceHistoryItems: [
			{
				clientId: "Foo",
				time: "yesterday",
				changeKind: "joined",
			},
			{
				clientId: "Bar",
				time: "yesterday",
				changeKind: "joined",
			},
			{
				clientId: "Foo",
				time: "today",
				changeKind: "left",
			},
		],
	},
};
