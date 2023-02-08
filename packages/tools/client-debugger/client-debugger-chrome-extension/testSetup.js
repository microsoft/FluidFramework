/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Sets `global.chrome`
require("jest-webextension-mock");

const getDetails = (_, cb) => {
	if (cb !== undefined) {
		return cb();
	}
	return Promise.resolve();
};

global.chrome.action = {
	setBadgeText: jest.fn(),
	getBadgeText: jest.fn(getDetails),
	setBadgeBackgroundColor: jest.fn(),
	getBadgeBackgroundColor: jest.fn(getDetails),
	setTitle: jest.fn(),
	getTitle: jest.fn(getDetails),
	onClicked: {
		addListener: jest.fn(),
	},
};
