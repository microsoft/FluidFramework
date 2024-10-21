/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';

/**
 * {@link ColorModeImageSwitcher} component props.
 */
export interface ColorModeImageSwitcherProps {
	/**
	 * Image source to use when the site is in light mode.
	 */
	lightModeImageSource: string;

	/**
	 * Image source to use when the site is in dark mode.
	 */
	darkModeImageSource: string;

	/**
	 * Image alt text.
	 */
	altText?: string;
}

/**
 * Image switcher dependent on the site's color mode.
 * Displays a different source image depending on the active color mode.
 */
export function ColorModeImageSwitcher(
	{lightModeImageSource, darkModeImageSource, altText}: ColorModeImageSwitcherProps
): React.ReactElement {
	const { colorMode } = useColorMode();
	return <img src={colorMode === "dark" ? darkModeImageSource : lightModeImageSource} alt={altText} />;
}
