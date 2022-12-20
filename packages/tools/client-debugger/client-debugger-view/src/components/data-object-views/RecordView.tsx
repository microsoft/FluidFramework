/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import { SharedObjectRenderOptions } from "../../RendererOptions";
import { Accordion } from "../utility-components";
import { DynamicDataView } from "./DynamicDataView";

/**
 * {@link RecordDataView} input props.
 */
export interface RecordDataViewProps {
	/**
	 * The data to display.
	 */
	data: Record<string, unknown>;

	/**
	 * {@inheritDoc SharedObjectRenderOptions}
	 */
	renderOptions: SharedObjectRenderOptions;
}

/**
 * Renders each property of {@link RecordDataViewProps.data} in a list.
 */
export function RecordDataView(props: RecordDataViewProps): React.ReactElement {
	const { data, renderOptions } = props;

	const entries = Object.entries(data);
	return (
		<Stack>
			{entries.map(([key, value]) => (
				<StackItem key={key}>
					<Accordion
						header={
							<div>
								<b>"{key}"</b>
							</div>
						}
					>
						<DynamicDataView data={value} renderOptions={renderOptions} />
					</Accordion>
				</StackItem>
			))}
		</Stack>
	);
}
