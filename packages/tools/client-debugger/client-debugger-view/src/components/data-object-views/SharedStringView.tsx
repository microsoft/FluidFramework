/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { SharedString } from "@fluidframework/sequence";
import { CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";

/**
 * {@link SharedStringView} input props.
 */
export interface SharedStringViewProps {
	/**
	 * {@link @fluidframework/sequence#SharedString} whose data will be displayed.
	 */
	sharedString: SharedString;
}

/**
 * Default {@link @fluidframework/sequence#SharedString} viewer.
 */
export function SharedStringView(props: SharedStringViewProps): React.ReactElement {
	const { sharedString } = props;

	return (
		<CollaborativeTextArea
			style={{ height: 30, width: 200 }}
			sharedStringHelper={new SharedStringHelper(sharedString)}
		/>
	);
}
