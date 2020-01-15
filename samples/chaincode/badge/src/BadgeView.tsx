/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedCell } from "@microsoft/fluid-cell";
import { ISharedMap } from "@microsoft/fluid-map";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
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
} from "office-ui-fabric-react";
// eslint-disable-next-line import/no-internal-modules
import { MotionAnimations } from "@uifabric/fluent-theme/lib/fluent/FluentMotion";
import * as React from "react";
import { IBadgeType } from "./IBadgeType";
import { IHistory } from "./IHistory";

export interface IBadgeViewProps {
    currentCell: ISharedCell;
    optionsMap: ISharedMap;
    historySequence: SharedObjectSequence<IHistory<IBadgeType>>;
}

export interface IBadgeViewState {
    isDialogVisible: boolean;
    customText: string;
    customColor: IColor;
    current: IBadgeType;
    items: any;
}

export class BadgeView extends React.Component<IBadgeViewProps, IBadgeViewState> {

    private readonly defaultColor: string = "#fff";
    private readonly animation: string = "all 0.15s ease-in";
    private readonly cardPadding: string = "16px 24px";

    constructor(props: IBadgeViewProps) {
        super(props);

        this.state = {
            isDialogVisible: false,
            current: props.currentCell.get(),
            customColor: getColorFromString(this.defaultColor),
            customText: "",
            items: this._getItemsFromOptionsMap(props.optionsMap),
        };

        this._onClick = this._onClick.bind(this);
        this._onSave = this._onSave.bind(this);
        this._closeDialog = this._closeDialog.bind(this);
        this._updateColor = this._updateColor.bind(this);
        this._updateText = this._updateText.bind(this);
        this._setCurrent = this._setCurrent.bind(this);
        this._getCurrentTimestamp = this._getCurrentTimestamp.bind(this);
        this._onRenderCard = this._onRenderCard.bind(this);

        initializeIcons();
    }

    private _onClick(_, item: IBadgeType): void {
        if (item.key === "new") {
            this.setState({ isDialogVisible: true });
        }
        else {
            this._setCurrent(item);
        }
    }

    private _onSave(): void {
        if (this.state.customText !== "") {
            const newItem: IBadgeType = {
                key: this.state.customText,
                text: this.state.customText,
                iconProps: {
                    iconName: "Contact",
                    style: {
                        color: this.state.customColor.str,
                    },
                },
            };

            // Add to the badge options
            this.props.optionsMap.set(this.state.customText, newItem);

            this._setCurrent(newItem);

            this.setState({ customText: "" });
        }

        this._closeDialog();
    }

    private _closeDialog(): void {
        this.setState({ isDialogVisible: false });
    }

    private _setCurrent(newItem: IBadgeType): void {
        if (newItem.key !== this.state.current.key) {
            // Save current value into history
            const len = this.props.historySequence.getItemCount();
            this.props.historySequence.insert(len, [{
                value: newItem,
                timestamp: new Date(),
            }]);

            // Set new value
            this.props.currentCell.set(newItem);
        }
    }

    private _getCurrentTimestamp(): Date {
        const len = this.props.historySequence.getItemCount();
        return this.props.historySequence.getItems(len - 1)[0].timestamp;
    }

    private _updateColor(ev: React.SyntheticEvent<HTMLElement>, colorObj: IColor) {
        this.setState({ customColor: colorObj });
    }

    private _updateText(ev: React.SyntheticEvent<HTMLElement>, newValue: string) {
        this.setState({ customText: newValue });
    }

    private _getItemsFromOptionsMap(optionsMap: ISharedMap) {
        const items = [];
        optionsMap.forEach((v) => items.push(v));

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

    private _getTextColor(c: IColor) {
        // https://stackoverflow.com/questions/3942878/how-to-decide-font-color-in-white-or-black-depending-on-background-color
        return (c.r * 0.299 + c.g * 0.587 + c.b * 0.114 > 186) ?
            "#000000" : "#ffffff";
    }

    private _onRenderCard(): JSX.Element {
        const history = [];

        // Add items to history in reverse order
        this.props.historySequence.getItems(0).forEach((x) => {
            history.unshift(
                <ActivityItem
                    activityDescription={`Set to ${x.value.text}`}
                    // eslint-disable-next-line @typescript-eslint/no-use-before-define
                    timeStamp={getRelativeDate(x.timestamp)}
                    activityIcon={<Icon {...x.value.iconProps} />} />,
            );
        });

        return (
            <div style={{
                padding: this.cardPadding,
            }}>
                {history}
            </div>
        );
    }

    public async componentDidMount(): Promise<void> {
        this.props.currentCell.on("valueChanged", () => {
            this.setState({ current: this.props.currentCell.get() });
        });

        this.props.optionsMap.on("valueChanged", () => {
            this.setState({ items: this._getItemsFromOptionsMap(this.props.optionsMap) });
        });
    }

    public render(): JSX.Element {
        // Calculate colors
        const color = getColorFromString(this.state.current.iconProps.style.color);
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
        const textColor = this._getTextColor(color);

        return (
            <div style={{ animation: MotionAnimations.scaleDownIn }}>
                <HoverCard
                    plainCardProps={{
                        onRenderPlainCard: this._onRenderCard,
                        directionalHint: DirectionalHint.rightTopEdge,
                    }}
                    type={HoverCardType.plain}
                >
                    <DefaultButton
                        text={this.state.current.text}
                        iconProps={{ iconName: this.state.current.iconProps.iconName }}
                        menuProps={{
                            isBeakVisible: false,
                            shouldFocusOnMount: true,
                            items: this.state.items,
                            onItemClick: this._onClick,
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
                                transition: this.animation,
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
                    hidden={!this.state.isDialogVisible}
                    onDismiss={this._closeDialog}
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
                            onChange={this._updateText} />
                        <ColorPicker
                            color={this.state.customColor}
                            onChange={this._updateColor}
                            alphaSliderHidden={true}
                        />
                    </Stack>
                    <DialogFooter>
                        <PrimaryButton onClick={this._onSave} text="Save" />
                        <DefaultButton onClick={this._closeDialog} text="Cancel" />
                    </DialogFooter>
                </Dialog>
            </div>
        );
    }
}

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
        return `${Math.floor(delta / minute)  } minutes ago`;
    } else if (Math.floor(delta / hour) < 3) {
        return "a few hours ago.";
    } else if (delta < day) {
        return `${Math.floor(delta / hour)  } hours ago`;
    } else if (delta < day * 2) {
        return "yesterday";
    } else {
        return timestamp.toUTCString();
    }
}
