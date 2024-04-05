/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type VisualChildNode, VisualNodeKind } from "@fluidframework/devtools-core/internal";
import React from "react";

/**
 * TODO
 */
export interface ToolTipContentsViewProps {
	contents: Record<string, VisualChildNode> | undefined;
}

/**
 * TODO
 */
export function ToolTipContentsView(props: ToolTipContentsViewProps): React.ReactElement {
	const { contents } = props;

	if (contents === undefined) {
		return <></>;
	}

	const listItems: React.ReactElement[] = [];

	for (const [contentsValue] of Object.values(contents)) {
		if (contentsValue.nodeKind === VisualNodeKind.TreeNode) {
			for (const [fieldKey, fieldValue] of Object.entries(contentsValue.children)) {
				if (fieldValue.nodeKind === VisualNodeKind.ValueNode) {
					const listItem = (
						<li key={fieldKey}>
							{fieldKey} : {fieldValue.value}
						</li>
					);
					listItems.push(listItem);
				} else {
					throw new Error("Invalid Node Kind. Need to be a VisualNodeKind.ValueNode.");
				}
			}
		} else {
			throw new Error("Invalid Node Kind. Need to be a VisualNodeKind.TreeNode");
		}
	}

	return (
		<div>
			<ul> {listItems} </ul>
		</div>
	);
}
