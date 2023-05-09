/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Spinner } from "@fluentui/react";
import React from "react";

const defaultLabel = "Waiting for data from webpage.";

/**
 * {@link Waiting} input props.
 */
export interface WaitingProps {
	/**
	 * Label text to accompany the spinner.
	 */
	label?: string;
}

/**
 * Placeholder component to display while waiting for a data response from the webpage.
 */
export function Waiting(props: WaitingProps): React.ReactElement {
	const { label } = props;
	return <Spinner label={label ?? defaultLabel} />;
}
