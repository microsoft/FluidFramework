/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HomePageSection } from '@site/src/components/homePageSection';

import Diagram from '@site/static/assets/services-diagram.svg';

import "@site/src/css/serviceSection.css";

export function ServiceSection(): JSX.Element {
	return <HomePageSection title="Fluid Framework in the Cloud">
		<div>
			<Diagram />
		</div>
		<div>
			TODO
		</div>
	</HomePageSection>;
}
