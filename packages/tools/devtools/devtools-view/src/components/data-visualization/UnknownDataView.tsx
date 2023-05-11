/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { UnknownObjectNode } from "@fluid-experimental/devtools-core";

import { Tree } from "../utility-components";
import { DataVisalizationTreeProps } from "./CommonInterfaces";
import { TreeHeader } from "./TreeHeader";

/**
 * {@link UnknownDataView} input props.
 */
export type UnknownDataViewProps = DataVisalizationTreeProps<UnknownObjectNode>;

/**
 * Render data with type VisualNodeKind.UnknownObjectNode and render its children.
 */
export function UnknownDataView(props: UnknownDataViewProps): React.ReactElement {
	const { label, node } = props;

	const header = <TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} />;
	return (
		<Tree header={header}>
			<span>Unrecognized kind of data.</span>
		</Tree>
	);
}
