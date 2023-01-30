/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	IStackItemStyles,
	IStackStyles,
	IconButton,
	Stack,
	StackItem,
	TooltipHost,
} from "@fluentui/react";
import React from "react";

import { SharedCounter } from "@fluidframework/counter";

// TODOs:
// - This seems like it might be worth sharing somewhere more general?
//   Common, simple widget for interacting with SharedCounter_s.

/**
 * Tooltip element ID used by the widget's decrement button.
 */
const decrementButtonTooltipId = "decrement-counter-button";

/**
 * Tooltip element ID used by the widget's increment button.
 */
const incrementButtonTooltipId = "increment-counter-button";

/**
 * {@link CounterWidget} input props.
 */
export interface CounterWidgetProps {
	counter: SharedCounter;
}

/**
 * Simple counter widget.
 * Backed by a {@link @fluidframework/counter#SharedCounter}.
 * Affords simple incrementing and decrementing via buttons.
 */
export function CounterWidget(props: CounterWidgetProps): React.ReactElement {
	const { counter } = props;

	const [counterValue, setCounterValue] = React.useState<number>(counter.value);

	React.useEffect(() => {
		function updateCounterValue(delta: number, newValue: number): void {
			setCounterValue(Math.max(newValue, 0));
		}

		counter.on("incremented", updateCounterValue);

		return (): void => {
			counter.off("incremented", updateCounterValue);
		};
	}, [counter]);

	/**
	 * Decrement the shared counter by 1.
	 */
	function decrementCounter(): void {
		counter.increment(-1);
	}

	/**
	 * Increment the shared counter by 1.
	 */
	function incrementCounter(): void {
		counter.increment(1);
	}

	const stackStyles: IStackStyles = {
		root: {
			alignItems: "center",
		},
	};

	const stackItemStyles: IStackItemStyles = {
		root: {
			padding: "5px",
		},
	};

	return (
		<Stack horizontal styles={stackStyles}>
			<StackItem styles={stackItemStyles}>
				<TooltipHost
					content="Decrement counter by 1 (min 0)."
					id={decrementButtonTooltipId}
				>
					<IconButton
						onClick={decrementCounter}
						disabled={counterValue === 0}
						menuIconProps={{ iconName: "CalculatorSubtract" }}
						aria-describedby={decrementButtonTooltipId}
					/>
				</TooltipHost>
			</StackItem>
			<StackItem styles={stackItemStyles}>
				<div>{counterValue}</div>
			</StackItem>
			<StackItem styles={stackItemStyles}>
				<TooltipHost content="Increment counter by 1." id={incrementButtonTooltipId}>
					<IconButton
						onClick={incrementCounter}
						menuIconProps={{ iconName: "CalculatorAddition" }}
						aria-describedby={incrementButtonTooltipId}
					/>
				</TooltipHost>
			</StackItem>
		</Stack>
	);
}
