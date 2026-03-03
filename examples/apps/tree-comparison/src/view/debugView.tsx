/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FC } from "react";

import type { IInventoryListAppModel } from "../modelInterfaces.js";

export interface IDebugViewProps {
	model: IInventoryListAppModel;
}

export const DebugView: FC<IDebugViewProps> = ({ model }: IDebugViewProps) => {
	return (
		<div>
			<h2 style={{ textDecoration: "underline" }}>Debug info</h2>
		</div>
	);
};
