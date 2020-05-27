/* eslint-disable comma-dangle */
/* eslint-disable @typescript-eslint/no-use-before-define */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from "react";
import {
    ActivityItem,
    DefaultButton,
    PrimaryButton,
    DirectionalHint,
    Dialog,
    DialogFooter,
    DialogType,
    HoverCard,
    HoverCardType,
    Icon,
    initializeIcons,
    ColorPicker,
    getColorFromString,
    IColor,
    Stack,
    TextField,
    IContextualMenuItem
} from "office-ui-fabric-react";
// eslint-disable-next-line import/no-internal-modules
import { MotionAnimations } from "@uifabric/fluent-theme/lib/fluent/FluentMotion";
import { IBadgeType } from "./IBadgeType";
import { IHistory } from "./IHistory";
import {
    getItemsFromOptionsMap,
    getRelativeDate,
    getButtonStyles
} from "./helpers";

const { useState } = React;

export interface IBadgeViewProps {
    options: IBadgeType[];
    historyItems: IHistory<IBadgeType>[];
    selectedOption: string | number;
    addOption: (text: string, color: IColor) => void;
    changeSelectedOption: (item: IBadgeType) => void;
}

initializeIcons();

export const BadgeView = (props: IBadgeViewProps): JSX.Element => {
    const {
        options,
        historyItems,
        selectedOption,
        addOption,
        changeSelectedOption
    } = props;

    const currentOption = options.find((option) => option.key === selectedOption);

    const defaultColor: string = "#fff";
    const cardPadding: string = "16px 24px";

    // Set up local state
    const [isDialogVisible, setIsDialogVisible] = useState<boolean>(false);
    const [customColor, setCustomColor] = useState<IColor>(
        getColorFromString(defaultColor)
    );
    const [customText, setCustomText] = useState<string>("");

    const onClick = (_, item: IContextualMenuItem): void => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        item.key === "new"
            ? setIsDialogVisible(true)
            : changeSelectedOption(item as IBadgeType);
    };

    const onSave = (): void => {
        if (customText !== "") {
            addOption(customText, customColor);
            setCustomText("");
        }

        closeDialog();
    };

    const closeDialog = (): void => {
        setIsDialogVisible(false);
    };

    const updateColor = (_, colorObj: IColor) => {
        setCustomColor(colorObj);
    };

    const updateText = (_, newValue: string) => {
        setCustomText(newValue);
    };

    const onRenderCard = (): JSX.Element => {
        // Add items to history in reverse order
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

        return <div style={{ padding: cardPadding }}>{history.reverse()}</div>;
    };

    const buttonStyles = getButtonStyles(currentOption.iconProps.style.color);

    return (
        <div
            style={{
                animation: MotionAnimations.scaleDownIn,
                display: "inline-block"
            }}
        >
            <HoverCard
                plainCardProps={{
                    onRenderPlainCard: onRenderCard,
                    directionalHint: DirectionalHint.rightTopEdge
                }}
                type={HoverCardType.plain}
            >
                <DefaultButton
                    text={currentOption.text}
                    iconProps={{
                        iconName: currentOption.iconProps.iconName
                    }}
                    menuProps={{
                        isBeakVisible: false,
                        shouldFocusOnMount: true,
                        items: getItemsFromOptionsMap(options),
                        onItemClick: onClick
                    }}
                    styles={buttonStyles}
                />
            </HoverCard>

            <Dialog
                hidden={!isDialogVisible}
                onDismiss={closeDialog}
                dialogContentProps={{
                    type: DialogType.normal,
                    title: "Add a custom status"
                }}
                modalProps={{
                    isBlocking: false,
                    styles: { main: { maxWidth: 450 } }
                }}
            >
                <Stack>
                    <TextField
                        placeholder="Custom status name"
                        onChange={updateText}
                    />
                    <ColorPicker
                        color={customColor}
                        onChange={updateColor}
                        alphaSliderHidden={true}
                    />
                </Stack>
                <DialogFooter>
                    <PrimaryButton onClick={onSave} text="Save" />
                    <DefaultButton onClick={closeDialog} text="Cancel" />
                </DialogFooter>
            </Dialog>
        </div>
    );
};
