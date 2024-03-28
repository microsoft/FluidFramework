/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";
/**
 * Render data with type VisualNodeKind.ValueNode and render its children.
 */
export function ValueView(props) {
	const { label, node } = props;
	const metadata = JSON.stringify(node.metadata);
	const header = React.createElement(TreeHeader, {
		label: label,
		nodeTypeMetadata: node.typeMetadata,
		inlineValue: String(node.value),
		sharedTreeSchemaData: node.sharedTreeSchemaData,
		metadata: metadata,
	});
	return React.createElement(TreeItem, { header: header });
}
//# sourceMappingURL=ValueView.js.map
