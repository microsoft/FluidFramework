/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ContextualMenuItemType,
    IContextualMenuItem,
    IColor,
    getColorFromHSV,
    getColorFromString,
    IButtonStyles,
} from "office-ui-fabric-react";
import { SharedColors } from "@uifabric/fluent-theme";
import { IBadgeType } from "./Badge.types";

export const defaultItems: IBadgeType[] = [
    {
        key: "drafting",
        text: "Drafting",
        iconProps: {
            iconName: "Edit",
            style: {
                color: SharedColors.cyanBlue10,
            },
        },
    },
    {
        key: "reviewing",
        text: "Reviewing",
        iconProps: {
            iconName: "Chat",
            style: {
                color: SharedColors.orange20,
            },
        },
    },
    {
        key: "complete",
        text: "Complete",
        iconProps: {
            iconName: "Completed",
            style: {
                color: SharedColors.green10,
            },
        },
    },
    {
        key: "archived",
        text: "Archived",
        iconProps: {
            iconName: "Archive",
            style: {
                color: SharedColors.magenta10,
            },
        },
    },
];

export const getItemsFromOptionsMap = (options: IContextualMenuItem[]) => {
    const mapItems = [...options];

    mapItems.push({
        key: "divider_1",
        itemType: ContextualMenuItemType.Divider,
    });
    mapItems.push({
        key: "new",
        text: "Set custom...",
        iconProps: {
            iconName: "Add",
        },
    });

    return mapItems;
};

export const getTextColor = (c: IColor) => {
    // eslint-disable-next-line max-len
    // https://stackoverflow.com/questions/3942878/how-to-decide-font-color-in-white-or-black-depending-on-background-color
    return c.r * 0.299 + c.g * 0.587 + c.b * 0.114 > 186
        ? "#000000"
        : "#ffffff";
};

export const getButtonStyles = (baseColor: string): IButtonStyles => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const color = getColorFromString(baseColor)!;
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
    const textColor = getTextColor(color);
    const animation: string = "all 0.15s ease-in";

    return {
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
    };
};

export const getRelativeDate = (timestamp: string): string => {
    const date = new Date(timestamp);

    // https://stackoverflow.com/questions/7641791/javascript-library-for-human-friendly-relative-date-formatting
    const delta = Math.round(
        (new Date().getTime() - date.getTime()) / 1000,
    );

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
        return date.toUTCString();
    }
};
