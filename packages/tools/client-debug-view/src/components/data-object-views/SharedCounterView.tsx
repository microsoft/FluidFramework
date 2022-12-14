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
    const [deltaValue, setDeltaValue] = React.useState("");

	React.useEffect(() => {
		function updateValue(delta: number, newValue: number): void {
			setValue(newValue);
		}

		sharedCounter.on("incremented", updateValue);

		return (): void => {
			sharedCounter.off("incremented", updateValue);
		};
	}, [sharedCounter, setValue]);

    function decrementCounter(): void {
        sharedCounter.increment(-Number.parseInt(deltaValue, 10));
        setDeltaValue("");
	}

    function incrementCounter(): void {
		sharedCounter.increment(Number.parseInt(deltaValue, 10));
        setDeltaValue("");
	}

    const inputSetValue = (e: React.ChangeEvent<HTMLInputElement>): void => {
        setDeltaValue(e.target.value);
    }

	return (
		<Stack>
			<StackItem>
				<b>SharedCounter</b>
			</StackItem>
			<StackItem>Value: {value} </StackItem>
            <StackItem>
                <TooltipHost
					content="Decrememt counter by the delta-value."
					id={decrementButtonTooltipId}
				>
                    <IconButton
                            onClick={decrementCounter}
                            disabled={deltaValue === ""}
                            menuIconProps={{ iconName: "CalculatorSubtract" }}
                            aria-describedby={decrementButtonTooltipId}
                    />
                </TooltipHost>

                <TooltipHost
                    content="Enter the delta value of your choice"
                    id={inputFieldTooltipId}
                >
                    <input type="number" onChange={inputSetValue} placeholder="Enter Delta" value={deltaValue}/>
                </TooltipHost>

                <TooltipHost
					content="Increment counter by the delta-value."
					id={incrementButtonTooltipId}
				>
                    <IconButton
                            onClick={incrementCounter}
                            disabled={deltaValue === ""}
                            menuIconProps={{ iconName: "CalculatorAddition" }}
                            aria-describedby={incrementButtonTooltipId}
                    />
                </TooltipHost>
            </StackItem>
		</Stack>
	);
}
