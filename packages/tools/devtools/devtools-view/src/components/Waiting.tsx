/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Spinner } from "@fluentui/react-components";
import React from "react";

/**
 * Default label displayed by {@link Waiting} when no {@link WaitingProps.label} is specified.
 */
export const defaultWaitingLabel = "Waiting for data from webpage.";

/**
 * {@link Waiting} input props.
 */
export interface WaitingProps {
	/**
	 * Label text to accompany the spinner.
	 *
	 * @defaultValue {@link defaultWaitingLabel}
	 */
	label?: string;
}

/**
 * Placeholder component to display while waiting for a data response from the webpage.
 */
export function Waiting(props: WaitingProps): React.ReactElement {
	const { label } = props;
	return <Spinner label={label ?? defaultWaitingLabel} />;
}
