/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import "@site/src/css/home/sectionHeader.css";

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
		<div className="ffcom-section-header">
			<div className="ffcom-section-header-inner">
				{subtitle === undefined ? (
					<></>
				) : (
					<p className="ffcom-section-header-subtitle">{subtitle}</p>
				)}
				<h2 className="ffcom-section-header-title">{title}</h2>
			</div>
		</div>
	);
}
