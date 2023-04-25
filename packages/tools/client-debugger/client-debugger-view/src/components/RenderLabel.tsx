/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { Primitive } from "@fluid-tools/client-debugger";
// eslint-disable-next-line import/no-internal-modules
import { TreeItemLayout } from "@fluentui/react-components/unstable";
import { tokens } from "@fluentui/react-components";

/**
 * TODO
 */
export interface RenderLabelProps {
	nodeKey: string | undefined;
	nodeTypeMetadata?: string | undefined;
	nodeKind?: string;
	itemSize?: Primitive;
	nodeValue?: Primitive;
}

/**
 * TODO
 */
export function RenderLabel(props: RenderLabelProps): React.ReactElement {
	const { nodeKey, nodeTypeMetadata, nodeKind, itemSize, nodeValue } = props;

	return (
		<>
			{nodeValue !== undefined ? (
				<TreeItemLayout>
					{`${nodeKey}`}
					<span style={{ color: tokens.colorPaletteRedBorderActive, fontSize: "12px" }}>
						({nodeTypeMetadata})
					</span>
					{`: ${String(nodeValue)}`}
				</TreeItemLayout>
			) : (
				<TreeItemLayout>
					{`${nodeKey === undefined ? nodeTypeMetadata : nodeKey}`}
					<span style={{ color: tokens.colorPaletteRedBorderActive, fontSize: "12px" }}>
						({nodeTypeMetadata === undefined ? nodeKind : nodeTypeMetadata})
					</span>
					{`${
						itemSize === undefined
							? ""
							: `${String(itemSize)} ${itemSize === 1 ? "item" : "items"}`
					}`}
				</TreeItemLayout>
			)}
		</>
	);
}
