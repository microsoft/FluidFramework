/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import React, { useState } from "react";
import {
    ActivityItem,
    DefaultButton,
    PrimaryButton,
    DirectionalHint,
    Dialog,
    DialogFooter,
    HoverCard,
    HoverCardType,
    Icon,
    initializeIcons,
    ColorPicker,
    getColorFromString,
    IColor,
    Stack,
    TextField,
    IContextualMenuItem,
} from "@fluentui/react";
import { MotionAnimations } from "@uifabric/fluent-theme";
import { IBadgeType } from "./IBadgeType";
import { IHistory } from "./IHistory";
import {
    getItemsFromOptionsMap,
    getRelativeDate,
    getButtonStyles,
} from "./helpers";

initializeIcons();

export interface IBadgeViewProps {
    options: IBadgeType[];
    historyItems: IHistory<IBadgeType>[];
    selectedOption: string | number;
    addOption: (text: string, color: IColor) => void;
    changeSelectedOption: (item: IBadgeType) => void;
}

export const BadgeView = (props: IBadgeViewProps): JSX.Element => {
    const {
        options,
        historyItems,
        selectedOption,
        addOption,
        changeSelectedOption,
    } = props;

    // Find the option that is currently selected
    const currentOption = options.find((option) => option.key === selectedOption);

    // Set up local state for our color picker
    // Is the color picker visible?
    const [isCustomStatusVisible, setIsCustomStatusVisible] = useState<boolean>(false);
    // What is the current color of the color picker?
    const [customStatusColor, setCustomStatusColor] = useState<IColor>(
        getColorFromString("#fff"),
    );
    // What is the current text for the custom color
    const [customStatusText, setCustomStatusText] = useState<string>("");

    // Set up event handlers
    const onStatusClick = (_, item: IContextualMenuItem): void => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        item.key === "new"
            ? setIsCustomStatusVisible(true)
            : changeSelectedOption(item as IBadgeType);
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

    const updateCustomStatusText = (_, newValue: string) => {
        setCustomStatusText(newValue);
    };

    // Create a render function for our history card. This could easily be another component in another file.
    const historyCardContent = (): JSX.Element => {
        // eslint-disable-next-line react/prop-types
        const history = historyItems.map((x, i) => {
            return (
                <ActivityItem
                    key={i}
                    activityDescription={`Set to ${x.value.text}`}
                    timeStamp={getRelativeDate(x.timestamp)}
                    activityIcon={<Icon {...x.value.iconProps} />}
                />
            );
        });

        return <div style={{ padding: "16px 24px" }}>{history.reverse()}</div>;
    };

    const buttonStyles = getButtonStyles(currentOption.iconProps.style.color);

    return (
        <div
            style={{
                animation: MotionAnimations.scaleDownIn,
                display: "inline-block",
            }}
        >
            <HoverCard
                plainCardProps={{
                    onRenderPlainCard: historyCardContent,
                    directionalHint: DirectionalHint.rightTopEdge,
                }}
                type={HoverCardType.plain}
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
            </HoverCard>

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
