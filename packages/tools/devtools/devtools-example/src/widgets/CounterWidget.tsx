/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Button, Text, Tooltip, makeStyles, shorthands } from "@fluentui/react-components";
import { AddSquare24Regular, SubtractSquare24Regular } from "@fluentui/react-icons";
import type { SharedCounter } from "@fluidframework/counter/internal";
import React from "react";

// TODOs:
// - This seems like it might be worth sharing somewhere more general?
//   Common, simple widget for interacting with SharedCounter_s.

/**
 * Styles for the widget.
 */
const useStyles = makeStyles({
	/**
	 * Root of the app (both internal app views + embedded devtools panel)
	 */
	root: {
		display: "flex",
		flexDirection: "row",
		alignItems: "center",
	},

	counterText: {
		...shorthands.padding("10px"),
	},
});

/**
 * {@link CounterWidget} input props.
 * @internal
 */
export interface CounterWidgetProps {
	counter: SharedCounter;
}

/**
 * Simple counter widget.
 * Backed by a {@link @fluidframework/counter#SharedCounter}.
 * Affords simple incrementing and decrementing via buttons.
 * @internal
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
	}, [counter, setCounterValue]);

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

	const styles = useStyles();

	return (
		<div className={styles.root}>
			<Tooltip content="Decrement counter by 1 (min 0)." relationship="description">
				<Button
					// size="small"
					icon={<SubtractSquare24Regular />}
					onClick={decrementCounter}
					disabled={counterValue === 0}
				/>
			</Tooltip>
			<Text className={styles.counterText}>{counterValue}</Text>
			<Tooltip content="Increment counter by 1." relationship="description">
				<Button
					// size="small"
					icon={<AddSquare24Regular />}
					onClick={incrementCounter}
				/>
			</Tooltip>
		</div>
	);
}
