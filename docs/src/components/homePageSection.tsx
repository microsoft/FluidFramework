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
	image?: string;
}>;

/**
 * Common base component for homepage sections
 */
export function HomePageSection({title, subtitle, image, children}: HomePageSectionProps): JSX.Element {
	const sectionStyle = image
    ? { backgroundImage: `url(${image})`, backgroundSize: '150%',
  	backgroundPosition: 'center',
  	backgroundRepeat: 'no-repeat' }
    : {};



	return (
		<div className="homePageSection" style={sectionStyle}>
			<div className='overlayBG'/>
			<div className="homePageSectionInner">
				<SectionHeader title={title} subtitle={subtitle} />
				{children}
			</div>
		</div>
	);
}
