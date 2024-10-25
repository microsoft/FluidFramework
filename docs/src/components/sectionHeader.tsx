/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import "@site/src/css/sectionHeader.css";

/**
 * {@link SectionHeader} component props.
 */
export interface SectionHeaderProps {
	/**
	 * Section title.
	 */
	title: string;

	/**
	 * Optional section subtitle.
	 */
	subtitle?: string;
}

/**
 * Homepage section header component.
 */
export function SectionHeader({ title, subtitle }: SectionHeaderProps): JSX.Element {
	return (
		<div className="sectionHeader">
			<div className="sectionHeaderInner">
				{subtitle && <p className="sectionHeaderSubtitle">{subtitle}</p>}
				<p className="sectionHeaderTitle">{title}</p>
			</div>
		</div>
	);
}
