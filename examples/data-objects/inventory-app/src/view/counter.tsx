/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useTreeContext } from "@fluid-experimental/tree-react-api";
import { SchemaBuilder, TypedField, leaf } from "@fluid-experimental/tree2";
import * as React from "react";

const schema = SchemaBuilder.fieldRequired(leaf.number);

export interface ICounterProps {
	title: string;
	count: TypedField<typeof schema>;
}

/**
 * Counter implementation
 */
export const Counter = ({ title, count }: ICounterProps): React.ReactElement => {
	useTreeContext(count.context);
	return (
		<div className="counter">
			<h2>{title}</h2>
			<div className="counter_spinner">
				<button
					onClick={() => (count.content = count.content - 1)}
					disabled={!(count.content > 0)}
				>
					-
				</button>
				<span className="counter_value">{count.content}</span>
				<button onClick={() => (count.content = count.content + 1)}>+</button>
			</div>
		</div>
	);
};
