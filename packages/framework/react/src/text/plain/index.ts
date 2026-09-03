/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	MainView as PlainTextMainView,
	type MainViewProps as PlainTextMainViewProps,
} from "./plainTextView.js";
export {
	syncTextToTree,
	type TextSelection,
} from "./plainUtils.js";
export {
	useTreeSynchronizedString,
	type SynchronizedString,
} from "./useTreeSynchronizedString.js";
