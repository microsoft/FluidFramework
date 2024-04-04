/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeTextArea, SharedStringHelper } from "@fluid-example/example-utils";
import { SharedString } from "@fluidframework/sequence/internal";
import React from "react";

interface CollaborativeTextProps {
	text: SharedString;
}

/**
 * @internal
 */
export const CollaborativeTextView = (props: CollaborativeTextProps) => {
	return (
		<div className="text-area">
			<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(props.text)} />
		</div>
	);
};
