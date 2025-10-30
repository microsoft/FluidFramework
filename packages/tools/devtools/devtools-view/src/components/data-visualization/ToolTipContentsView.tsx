/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type VisualChildNode, VisualNodeKind } from "@fluidframework/devtools-core/internal";
import React from "react";

/**
 * Interface for the props of {@link ToolTipContentsView}.
 */
export interface ToolTipContentsViewProps {
	contents: Record<string, VisualChildNode> | string;
}

/**
 * Component to render the contents of a {@link ToolTipContentsViewProps}.
 * @param props - {@link ToolTipContentsViewProps}
 * @returns a key-value pair of items as a list if `Record<string, VisualChildNode>`, a string otherwise.
 */
export function ToolTipContentsView(props: ToolTipContentsViewProps): React.ReactElement {
	const { contents } = props;

	if (typeof contents === "string") {
		return <div> {contents} </div>;
	}

	const listItems: React.ReactElement[] = [];
	let listItem: React.ReactElement;

	// TOOD: Fix the entire component's logic to handle recursive input data.
	// Currently, it only supports a single level of data and it is a temporary solution.
	for (const contentsValue of Object.values(contents)) {
		if (contentsValue.nodeKind === VisualNodeKind.TreeNode) {
			for (const [fieldKey, fieldValue] of Object.entries(contentsValue.children)) {
				listItem =
					fieldValue.nodeKind === VisualNodeKind.ValueNode ? (
						<li key={fieldKey}>
							{fieldKey} : {fieldValue.value}
						</li>
					) : (
						<i>
							<li>Unsupported Data Structure</li>
						</i>
					);
				listItems.push(listItem);
			}
		} else {
			listItem = (
				<i>
					<li>Unsupported VisualNodeKind</li>
				</i>
			);
		}
	}

	return (
		<div>
			<ul> {listItems} </ul>
		</div>
	);
}
