/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import React from "react";

import { SharedCounter } from "@fluidframework/counter";

/**
 * Tooltip element ID used by the widget's decrement button.
 */
const decrementButtonTooltipId = "decrement-counter-button";

/**
 * Tooltip element ID used by the widget's increment button.
 */
const incrementButtonTooltipId = "increment-counter-button";

/**
 * Tooltip element ID used by the widget's input field
 */
const inputFieldTooltipId = "change-counter-input";


/**
 * {@link SharedCounterView} input props.
 */
export interface SharedCounterViewProps {
	/**
	 * {@link @fluidframework/map#SharedMap} whose data will be displayed.
	 */
	sharedCounter: SharedCounter;
}

/**
 * Default {@link @fluidframework/counter#SharedCounter} viewer.
 */
export function SharedCounterView(props: SharedCounterViewProps): React.ReactElement {
	const { sharedCounter } = props;

	const [value, setValue] = React.useState<number>(sharedCounter.value);

	React.useEffect(() => {
		function updateValue(delta: number, newValue: number): void {
			setValue(Math.max(newValue, 0));
		}

		sharedCounter.on("incremented", updateValue);

		return (): void => {
			sharedCounter.off("incremented", updateValue);
		};
	}, [sharedCounter, setValue]);


    function decrementCounter(): void {
        sharedCounter.increment(-1);
	}

    function incrementCounter(): void {
		sharedCounter.increment(1);
	}

    const inputSetValue = (e: any): void => {
        numberFormatCheck(e.target.value);
    }

    const numberFormatCheck = (val: number): void => {
        const num = val ?? value;

        if (!isFinite(num) || num[0] === '-') {
            return
        }

        sharedCounter.increment(num - value);
    }

	return (
		<Stack>
			<StackItem>
				<b>SharedCounter</b>
			</StackItem>
			<StackItem>Value: {value} </StackItem>
            <StackItem>
                <TooltipHost
					content="Decrement counter by 1 (min 0)."
					id={decrementButtonTooltipId}
				>
                    <IconButton
                            onClick={decrementCounter}
                            disabled={value === 0}
                            menuIconProps={{ iconName: "CalculatorSubtract" }}
                            aria-describedby={decrementButtonTooltipId}
                    />
                </TooltipHost>

                <TooltipHost
                    content="Change the counter value by passing the number in input field"
                    id={inputFieldTooltipId}
                >
                    <input type="number" onChange={inputSetValue} value={value}/>
                </TooltipHost>

                <TooltipHost
					content="Increment counter by 1."
					id={incrementButtonTooltipId}
				>
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
