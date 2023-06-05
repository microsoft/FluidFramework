/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { initializeIcons } from "@fluentui/react";

let iconsInitialized = false;

/**
 * Initialize Fluent icons used this library's components, if they have not already been initialized.
 *
 * @remarks Wraps FluentUI's icon initialization, ensuring it is only called once.
 * FluentUI reports errors if this is called more than once, but as this library exports multiple entry-points,
 * it is impossible to say which module needs to call this.
 */
export function initializeFluentUiIcons(): void {
	if (!iconsInitialized) {
		initializeIcons();
		iconsInitialized = true;
	}
}
