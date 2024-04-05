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
	contents: Record<string, VisualChildNode> | string;
}

/**
 * TODO
 */
export function ToolTipContentsView(props: ToolTipContentsViewProps): React.ReactElement {
	const { contents } = props;

	if (contents === undefined) {
		return <></>;
	}

	if (typeof contents === "string") {
		return <div> {contents} </div>;
	}

	const listItems: React.ReactElement[] = [];
	let listItem: React.ReactElement;

	for (const contentsValue of Object.values(contents)) {
		if (contentsValue.nodeKind === VisualNodeKind.TreeNode) {
			for (const [fieldKey, fieldValue] of Object.entries(contentsValue.children)) {
				listItem =
					fieldValue.nodeKind === VisualNodeKind.ValueNode ? (
						<li key={fieldKey}>
							{fieldKey} : {fieldValue.value}
						</li>
					) : (
						<li>Unsupported Data Structure!</li>
					);
				listItems.push(listItem);
			}
		} else {
			listItem = <li>Unsupported VisualNodeKind!</li>;
		}
	}

	return (
		<div>
			<ul> {listItems} </ul>
		</div>
	);
}
