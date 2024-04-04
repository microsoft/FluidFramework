/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IToolTipContents } from "@fluidframework/devtools-core";
import React from "react";

interface TooltipContentsProps {
	contents: IToolTipContents;
}

function tooltipContentsAllowedTypes(
	allowedTypes: Record<string | number, string> | undefined,
): React.ReactElement {
	if (allowedTypes === undefined) {
		return <></>;
	}

	return (
		<ul>
			{Object.entries(allowedTypes).map(([key, value]) => (
				<li key={key}>
					{key} : {value}
				</li>
			))}
		</ul>
	);
}

/**
 * TODO
 */
export function TooltipContentsHelper(props: TooltipContentsProps): React.ReactElement {
	const { contents } = props;

	return (
		<div>
			<ul>
				<li> name : {contents.name} </li>
				<li> schemaType: {contents.schemaType} </li>
				<li>
					allowedTypes:
					{contents.allowedTypes === undefined
						? contents.name
						: typeof contents.allowedTypes === "string"
						? contents.allowedTypes
						: tooltipContentsAllowedTypes(contents.allowedTypes)}
				</li>
			</ul>
		</div>
	);
}
