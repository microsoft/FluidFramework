/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { SectionHeader } from "@site/src/components/sectionHeader";

import "@site/src/css/homePageSection.css";

/**
 * {@link HomePageSection} component props.
 */
export type HomePageSectionProps = React.PropsWithChildren<{
	/**
	 * Section title.
	 */
	title: string;

	/**
	 * Optional section subtitle.
	 */
	subtitle?: string;

	/**
	 * Optional background style to apply to the root element of the section.
	 */
	backgroundStyle?: React.CSSProperties;
}>;

/**
 * Common base component for homepage sections
 */
export function HomePageSection({
	title,
	subtitle,
	backgroundStyle,
	children,
}: HomePageSectionProps): JSX.Element {
	return (
		<div className="homePageSection" style={backgroundStyle}>
			<div className="homePageSectionInner">
				<SectionHeader title={title} subtitle={subtitle} />
				{children}
			</div>
		</div>
	);
}
