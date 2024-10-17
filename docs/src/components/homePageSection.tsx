/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SectionHeader } from '@site/src/components/sectionHeader';

import "@site/src/css/homePageSection.css";

/**
 * {@link HomePageSection} component props.
 */
export type HomePageSectionProps = React.PropsWithChildren<{
	title: string;
	subtitle?: string;
}>;

/**
 * Common base component for homepage sections
 */
export function HomePageSection({title, subtitle, children}: HomePageSectionProps): JSX.Element {
	return (<div className="homePageSection">
		<div className="homePageSectionInner">
			<SectionHeader title={title} subtitle={subtitle} />
			{children}
		</div>
	</div>);
}
