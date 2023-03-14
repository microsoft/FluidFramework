/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { ISummaryTree } from "@fluidframework/protocol-definitions";

import { DynamicDataView } from "./DynamicDataView";

/**
 * {@link SummaryTreeView} input props.
 */
export interface SummaryTreeViewProps {
	/**
	 * Container data summary.
	 */
	summary: ISummaryTree;
}

/**
 * Renders a tree-like visualization of the provided Container data summary.
 */
export function SummaryTreeView(props: SummaryTreeViewProps): React.ReactElement {
	const { summary } = props;

	// TODO: Something better
	return <DynamicDataView data={summary} renderOptions={{}} />;
}
