/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

/**
 * Component that renders when you click extension
 * @returns popup component
 */
export function PopupView(): React.ReactElement {
	// Set of features supported by the Devtools. true is devtools found, false not found and undefined means still looking
	const [foundDevtools, setFoundDevtools] = React.useState<boolean | undefined>();

	React.useEffect(() => {
		const responseTimeout: NodeJS.Timeout = setTimeout(() => {
			setFoundDevtools(false);
		}, 2000);

		// Cleanup listener on unmount
		return () => {
			clearTimeout(responseTimeout);
		};
	}, []);
	return (
		<div>
			{foundDevtools === undefined && <div>Loading...</div>}
			{foundDevtools === true && <div>Devtools found!</div>}
			{foundDevtools === false && <div>Devtools not found.</div>}
		</div>
	);
}
