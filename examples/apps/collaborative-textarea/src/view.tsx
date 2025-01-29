/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeTextArea, SharedStringHelper } from "@fluid-example/example-utils";
import { SharedString } from "@fluidframework/sequence/legacy";
import React from "react";

interface CollaborativeTextProps {
	text: SharedString;
}

/**
 * Collaborative text-area component.
 * @internal
 */
export const CollaborativeTextView = (props: CollaborativeTextProps): React.ReactElement => {
	return (
		<div className="text-area">
			<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(props.text)} />
		</div>
	);
};
