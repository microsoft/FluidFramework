/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from 'react';

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
    ? {
		backgroundImage: `linear-gradient(to bottom, rgba(255, 253, 251, 1) 10%, rgba(255, 253, 251, 0.2)), url(${image})`,
		backgroundSize: 'cover',
		backgroundPosition: 'center',
		backgroundRepeat: 'no-repeat'
	} : {};
	let imageStyle;
	if (title === "Fluid Framework in the Cloud") {
		imageStyle = sectionStyle;
	} else if(title === "See how it works") {
		imageStyle = {
			backgroundImage: `linear-gradient(to bottom, rgba(255, 253, 251, 0.8) 10%, rgba(255, 253, 251, 0.8)), url(${image})`,
			backgroundPosition: 'center',
  			backgroundRepeat: 'no-repeat',
			backgroundSize: 'cover',
		}
	}


	return (
		<div className="homePageSection" style={imageStyle}>
			<div className='contentBoundary'>
				<div className="homePageSectionInner">
					<SectionHeader title={title} subtitle={subtitle} />
					{children}
				</div>
			</div>
		</div>
	);
}
