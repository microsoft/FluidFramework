/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import "@site/src/css/sectionHeader.css";

export interface SectionHeaderProps {
	title: string;
	subtitle?: string;
}

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
