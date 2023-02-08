/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { initializeIcons } from "@fluentui/react";

let iconsInitialized = false;

/**
 * Initialize Fluent icons used this library's components, if they have not already been initialized.
 */
export function initializeFluentUiIcons(): void {
	if (!iconsInitialized) {
		initializeIcons();
		iconsInitialized = true;
	}
}
