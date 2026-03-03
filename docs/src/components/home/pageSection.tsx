/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CSSProperties, PropsWithChildren } from "react";

import { SectionHeader, type SectionHeaderProps } from "./sectionHeader";

import "@site/src/css/home/pageSection.css";

/**
 * {@link PageSection} component props.
 */
export type PageSectionProps = PropsWithChildren<
	SectionHeaderProps & {
		/**
		 * Optional background style to apply to the root element of the section.
		 */
		backgroundStyle?: CSSProperties;
	}
>;

/**
 * Common base component for homepage sections
 */
export function PageSection({
	title,
	subtitle,
	backgroundStyle,
	children,
}: PageSectionProps): JSX.Element {
	return (
		<div className="ffcom-home-page-section" style={backgroundStyle}>
			<div className="ffcom-home-page-section-inner">
				<SectionHeader title={title} subtitle={subtitle} />
				{children}
			</div>
		</div>
	);
}
