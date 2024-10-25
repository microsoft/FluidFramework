/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import "@site/src/css/card.css";

/**
 * {@link CardWithBlur} component props.
 */
export type CardWithBlurProps = React.PropsWithChildren<{
	// TODO: custom props as needed
}>;

/**
 * Simple card component with a blurred background.
 */
export function CardWithBlur({ children }: CardWithBlurProps): React.ReactElement {
	return <div className="ffcom-card-with-blur">{children}</div>;
}
