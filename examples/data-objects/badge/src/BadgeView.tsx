/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React, { useState, useMemo } from "react";
import {
    DefaultButton,
    PrimaryButton,
    Dialog,
    DialogFooter,
    initializeIcons,
    ColorPicker,
    getColorFromString,
    IColor,
    Stack,
    TextField,
    IContextualMenuItem,
} from "office-ui-fabric-react";
import { MotionAnimations } from "@uifabric/fluent-theme";
import { IBadgeViewProps, IBadgeType } from "./Badge.types";
import {
    getItemsFromOptionsMap,
    getButtonStyles,
} from "./helpers";

// Initialize icon font used in Fluent UI
initializeIcons();

// The BadgeView is completely unaware of the Fluid data structures. It only renders what is currently in Client state
// and uses Client provided functions to modify Fluid data, which is then fed back into state.

export const BadgeView: React.FC<IBadgeViewProps> = (props: IBadgeViewProps) => {
    const {
        options,
        selectedOption,
        addOption,
        changeSelectedOption,
    } = props;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const currentOption = options.find((option) => option.key === selectedOption)!;

    // Set up local state for our custom status creator

    const [isCustomStatusVisible, setIsCustomStatusVisible] = useState<boolean>(false);
    const [customStatusColor, setCustomStatusColor] = useState<IColor>(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        getColorFromString("#fff")!,
    );
    const [customStatusText, setCustomStatusText] = useState<string>("");

    // Set up event handlers
    const onStatusClick = (_, item: IContextualMenuItem | undefined): void => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        switch (item!.key) {
            case "new":
                setIsCustomStatusVisible(true);
                break;
            default:
                changeSelectedOption(item as IBadgeType);
        }
    };

    const closeCustomStatus = (): void => {
        setIsCustomStatusVisible(false);
    };

    const onSaveCustomStatus = (): void => {
        if (customStatusText !== "") {
            addOption(customStatusText, customStatusColor);
            setCustomStatusText("");
        }
        closeCustomStatus();
    };

    // Handle change events. These could include data validation.
    const updateCustomStatusColor = (_, colorObj: IColor) => {
        setCustomStatusColor(colorObj);
    };

    const updateCustomStatusText = (_, newValue: string | undefined) => {
        setCustomStatusText(newValue ?? "");
    };

    // Only recompute button styles when current option changes
    const buttonStyles = useMemo(
        () => getButtonStyles(currentOption.iconProps.style.color),
        [currentOption],
    );

    // Render our main view
    return (
        <div
            style={{
                animation: MotionAnimations.scaleDownIn,
                display: "inline-block",
            }}
        >
            <DefaultButton
                text={currentOption.text}
                iconProps={{
                    iconName: currentOption.iconProps.iconName,
                }}
                menuProps={{
                    isBeakVisible: false,
                    shouldFocusOnMount: true,
                    items: getItemsFromOptionsMap(options),
                    onItemClick: onStatusClick,
                }}
                styles={buttonStyles}
            />

            <Dialog
                hidden={!isCustomStatusVisible}
                onDismiss={closeCustomStatus}
                dialogContentProps={{ title: "Add a custom status" }}
                modalProps={{
                    isBlocking: false,
                    styles: { main: { maxWidth: 450 } },
                }}
            >
                <Stack>
                    <TextField
                        placeholder="Custom status name"
                        onChange={updateCustomStatusText}
                    />
                    <ColorPicker
                        color={customStatusColor}
                        onChange={updateCustomStatusColor}
                        alphaSliderHidden={true}
                    />
                </Stack>
                <DialogFooter>
                    <PrimaryButton onClick={onSaveCustomStatus} text="Save" />
                    <DefaultButton onClick={closeCustomStatus} text="Cancel" />
                </DialogFooter>
            </Dialog>
        </div>
    );
};
