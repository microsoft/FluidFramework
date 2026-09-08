/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PropsWithChildren, ReactElement } from "react";

import "@site/src/css/card.css";

/**
 * {@link CardWithBlur} component props.
 */
export type CardWithBlurProps = PropsWithChildren<{
	// TODO: custom props as needed
}>;

/**
 * Simple card component with a blurred background.
 */
export function CardWithBlur({ children }: CardWithBlurProps): ReactElement {
	return <div className="ffcom-card-with-blur">{children}</div>;
}
