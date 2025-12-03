/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

export interface ICounterProps {
	title: string;
	count: number;
	onIncrement: () => void;
	onDecrement: () => void;
}

/**
 * Counter implementation
 */
export const Counter = ({
	title,
	count,
	onIncrement,
	onDecrement,
}: ICounterProps): React.ReactElement => (
	<div className="counter">
		<h2>{title}</h2>
		<div className="counter_spinner">
			<button onClick={onDecrement} disabled={!(count > 0)}>
				-
			</button>
			<span className="counter_value">{count}</span>
			<button onClick={onIncrement}>+</button>
		</div>
	</div>
);
