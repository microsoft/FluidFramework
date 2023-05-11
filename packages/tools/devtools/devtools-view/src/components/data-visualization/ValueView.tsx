/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { ValueNodeBase } from "@fluid-experimental/devtools-core";

import { Tree } from "../utility-components";
import { DataVisalizationTreeProps } from "./CommonInterfaces";
import { TreeHeader } from "./TreeHeader";

/**
 * {@link ValueView} input props.
 */
export type ValueViewProps = DataVisalizationTreeProps<ValueNodeBase>;

/**
 * Render data with type VisualNodeKind.ValueNode and render its children.
 */
export function ValueView(props: ValueViewProps): React.ReactElement {
	const { label, node } = props;

	const header = (
		<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} nodeValue={node.value} />
	);
	return <Tree header={header} />;
}
