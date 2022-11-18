/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
it("Verify that listeners are registered by Background script.", () => {
	expect(chrome.action.onClicked.addListener).not.toHaveBeenCalled();
	expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
	// eslint-disable-next-line import/no-unassigned-import, @typescript-eslint/no-require-imports
	require("../Background");
	expect(chrome.action.onClicked.addListener).toHaveBeenCalledTimes(1);
	expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
});
