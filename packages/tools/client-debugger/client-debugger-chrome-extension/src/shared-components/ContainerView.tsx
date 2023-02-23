/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { HasContainerId } from "@fluid-tools/client-debugger-view";

import { ContainerSummaryView } from "./ContainerSummaryView";

/**
 * {@link ContainerView} input props.
 */
export type ContainerViewProps = HasContainerId;

/**
 * Root debug view for an individual Container.
 */
export function ContainerView(props: ContainerViewProps): React.ReactElement {
	const { containerId } = props;

	// TODO: render tab nav and inner tab views
	return <ContainerSummaryView containerId={containerId} />;
}
