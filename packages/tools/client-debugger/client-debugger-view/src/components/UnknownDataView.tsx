/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { UnknownObjectNode } from "@fluid-tools/client-debugger";

/**
 * {@link UnknownDataView} input props.
 */
export interface UnknownDataViewProps {
	node: UnknownObjectNode;
}

/**
 * Render data with type VisualNodeKind.UnknownObjectNode and render its children.
 */
export function UnknownDataView(props: UnknownDataViewProps): React.ReactElement {
	const { node } = props;

	return <div>{`Encountered an unrecognized kind of data object: ${node.nodeKind}`} </div>;
}
