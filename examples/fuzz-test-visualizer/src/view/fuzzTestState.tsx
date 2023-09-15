/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

export interface IFuzzTestState {
	treeState: string[];
	opNumber: number;
}

export function FuzzTestState(props: IFuzzTestState): React.ReactElement {
	const { treeState, opNumber } = props;

	return (
		<div>
			<pre>
				{treeState[opNumber] === "{}"
					? "Waiting for the client to join"
					: JSON.stringify(JSON.parse(treeState[opNumber])[0], null, 2)}
			</pre>
		</div>
	);
}
