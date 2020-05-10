/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ActivityItem,
    DefaultButton,
    PrimaryButton,
    ContextualMenuItemType,
    DirectionalHint,
    Dialog,
    DialogFooter,
    DialogType,
    HoverCard,
    HoverCardType,
    Icon,
    initializeIcons,
    ColorPicker,
    getColorFromHSV,
    getColorFromString,
    IColor,
    Stack,
    TextField,
    IContextualMenuItem,
} from "office-ui-fabric-react";
// eslint-disable-next-line import/no-internal-modules
import { MotionAnimations } from "@uifabric/fluent-theme/lib/fluent/FluentMotion";
import React, { useState } from "react";
import { IBadgeType } from "./IBadgeType";
import { IHistory } from "./IHistory";

initializeIcons();

const defaultColor = "#fff";
const animation: string = "all 0.15s ease-in";
const cardPadding: string = "16px 24px";

export interface IBadgeViewProps {
    current: IBadgeType;
    setCurrent(badgeOption: IBadgeType): void;
    options: IBadgeType[];
    addOption(badgeOption: IBadgeType): void;
    history: IHistory<IBadgeType>[];
    addToHistory(badgeType: IBadgeType, timestamp: Date): void;
    clientId?: string;
}

export interface IBadgeViewState {
    isDialogVisible: boolean;
    customText: string;
    customColor: IColor;
    current: IBadgeType;
    items: any;
}

const _getTextColor = (c: IColor) => {
    // eslint-disable-next-line max-len
    // https://stackoverflow.com/questions/3942878/how-to-decide-font-color-in-white-or-black-depending-on-background-color
    return (c.r * 0.299 + c.g * 0.587 + c.b * 0.114 > 186) ?
        "#000" : "#fff";
};

export const BadgeView = (props: IBadgeViewProps) => {
    const [isDialogVisible, setDialogVisible] = useState(false);
    const [customColor, setCustomColor] = useState(getColorFromString(defaultColor));
    const [customText, setCustomText] = useState("");
    const { setCurrent, current, options, addOption, addToHistory, history, clientId } = props;

    function closeDialog(): void {
        setDialogVisible(false);
    }

    // function _setCurrent(newItem: IBadgeType): void {
    //     if (newItem.key !== this.state.current.key) {
    //         // Save current value into history
    //         this.props.historySequence.insert(
    //             this.props.historySequence.getItemCount(), [
    //                 {
    //                     value: newItem,
    //                     timestamp: new Date(),
    //                 },
    //             ],
    //         );

    //         // Set new value
    //         this.props.currentCell.set(newItem);
    //     }
    // }

    function setCurrentAndAddHistory(newItem: IBadgeType): void {
        console.log(`${clientId}: setCurrentAndAddHistory; newItem: ${newItem.key}`);
        if (newItem.key !== current.key) {
            // Save current value into history
            addToHistory(current, new Date());

            // Set new value
            setCurrent(newItem);
        }
    }

    function onMenuItemClick(_, item: IContextualMenuItem): void {
        if (item.key === "new") {
            setDialogVisible(true);
        }
        else {
            setCurrentAndAddHistory(item as IBadgeType);
        }
    }

    function onSave(): void {
        if (customText !== "") {
            const newItem: IBadgeType = {
                key: customText,
                text: customText,
                iconProps: {
                    iconName: "Contact",
                    style: {
                        color: customColor.str,
                    },
                },
            };

            // Add to the badge options
            addOption(newItem);
            setCurrentAndAddHistory(newItem);
            setCustomText("");
        }

        setDialogVisible(false);
    }

    function updateColor(ev: React.SyntheticEvent<HTMLElement>, colorObj: IColor) {
        setCustomColor(colorObj);
    }

    function updateText(ev: React.SyntheticEvent<HTMLElement>, newValue: string) {
        setCustomText(newValue);
    }

    function getOptions() {
        const items = [];
        options.forEach((v) => items.push(v));

        items.push({
            key: "divider_1",
            itemType: ContextualMenuItemType.Divider,
        });
        items.push({
            key: "new",
            text: "Set custom...",
            iconProps: {
                iconName: "Add",
            },
        });

        return items;
    }

    function onRenderCard(): JSX.Element {
        const items = [];

        // Add items to history in reverse order
        // eslint-disable-next-line react/prop-types
        history.forEach((x) => {
            console.log(`${clientId}: x: ${typeof x}`);
            // const key = `${clientId}_${x.timestamp.getUTCDate()}`;
            items.unshift(
                <ActivityItem
                    activityDescription={`Set to ${x.value.text}`}
                    // eslint-disable-next-line @typescript-eslint/no-use-before-define
                    timeStamp={getRelativeDate(x.timestamp)}
                    activityIcon={<Icon {...x.value.iconProps}/>}
                    // key={key}
                />,
            );
        });

        return (
            <div style={{
                padding: cardPadding,
            }}>
                {items}
            </div>
        );
    }

    const color = getColorFromString(current.iconProps.style.color);
    const textColor = _getTextColor(color);

    const colorHover = getColorFromHSV({
        h: color.h,
        s: color.s,
        v: color.v + 5,
    });

    const colorPressed = getColorFromHSV({
        h: color.h,
        s: color.s,
        v: color.v - 5,
    });

    return (
        <div style={{ animation: MotionAnimations.scaleDownIn }}>
            <HoverCard
                plainCardProps={{
                    onRenderPlainCard: onRenderCard,
                    directionalHint: DirectionalHint.rightTopEdge,
                }}
                type={HoverCardType.plain}
            >
                <DefaultButton
                    text={current.text}
                    iconProps={{ iconName: current.iconProps.iconName }}
                    menuProps={{
                        isBeakVisible: false,
                        shouldFocusOnMount: true,
                        items: getOptions(),
                        onItemClick: onMenuItemClick,
                    }}
                    styles={{
                        label: {
                            color: textColor,
                        },
                        icon: {
                            color: textColor,
                        },
                        menuIcon: {
                            color: textColor,
                        },
                        root: {
                            backgroundColor: color.str,
                            transition: animation,
                        },
                        rootHovered: {
                            backgroundColor: colorHover.str,
                        },
                        rootPressed: {
                            backgroundColor: colorPressed.str,
                        },
                        rootExpanded: {
                            backgroundColor: colorPressed.str,
                        },
                    }}
                />
            </HoverCard>

            <Dialog
                hidden={!isDialogVisible}
                onDismiss={closeDialog}
                dialogContentProps={{
                    type: DialogType.normal,
                    title: "Add a custom status",
                }}
                modalProps={{
                    isBlocking: false,
                    styles: { main: { maxWidth: 450 } },
                }}
            >
                <Stack>
                    <TextField
                        placeholder="Custom status name"
                        onChange={updateText} />
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

function getRelativeDate(timestamp: Date): string {
    // https://stackoverflow.com/questions/7641791/javascript-library-for-human-friendly-relative-date-formatting
    const delta = Math.round(((new Date()).getTime() - new Date(timestamp).getTime()) / 1000);

    const minute = 60;
    const hour = minute * 60;
    const day = hour * 24;

    if (delta < 30) {
        return "just now";
    } else if (delta < 3 * minute) {
        return "a few minutes ago";
    } else if (delta < hour) {
        return `${Math.floor(delta / minute)} minutes ago`;
    } else if (Math.floor(delta / hour) < 3) {
        return "a few hours ago.";
    } else if (delta < day) {
        return `${Math.floor(delta / hour)} hours ago`;
    } else if (delta < day * 2) {
        return "yesterday";
    } else {
        return timestamp.toUTCString();
    }
}
