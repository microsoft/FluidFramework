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
    const [deltaValue, setDeltaValue] = React.useState(1);

	React.useEffect(() => {
		function updateValue(delta: number, newValue: number): void {
            console.log(newValue);
			setValue(newValue);
		}

		sharedCounter.on("incremented", updateValue);

		return (): void => {
			sharedCounter.off("incremented", updateValue);
		};
	}, [sharedCounter, setValue]);


    function decrementCounter(): void {
        sharedCounter.increment(-deltaValue);
	}

    function incrementCounter(): void {
		sharedCounter.increment(deltaValue);
	}

    const inputSetValue = (e: React.ChangeEvent<HTMLInputElement>): void => {
        numberFormatCheck(e.target.value);
    }

    const numberFormatCheck = (val: string): void => {
        const num = Number.parseInt(val, 10) || value;

        if (!Number.isFinite(num) || num[0] === '-') {
            return
        }

        setDeltaValue(num);
        // sharedCounter.increment(num - value);
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
                            // disabled={value === 0}
                            menuIconProps={{ iconName: "CalculatorSubtract" }}
                            aria-describedby={decrementButtonTooltipId}
                    />
                </TooltipHost>

                <TooltipHost
                    content="Change the counter value by passing the number in input field"
                    id={inputFieldTooltipId}
                >
                    <input type="number" onChange={inputSetValue}/>
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
