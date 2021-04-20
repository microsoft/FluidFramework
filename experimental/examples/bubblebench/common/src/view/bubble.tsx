/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { IBubble } from "../types";

export type IBubbleProps = Pick<IBubble, "x" | "y" | "r">;

export const BubbleView: React.FC<IBubbleProps> = ({ x, y, r }: IBubbleProps) => {
    return (
        <g transform={`translate(${x},${y}) scale(${r})`}>
            <circle r="1"
                fillOpacity="0.3"
                strokeWidth="0.1"
                strokeOpacity="0.5">
            </circle>
            <circle r="1" stroke="none" fillOpacity="0.05"></circle>
            <ellipse
                cx="-0.38"
                cy="-0.46"
                rx="0.19"
                ry="0.30"
                transform={`rotate(50,-0.38,-0.46)`} fill="white" stroke="none" />
        </g>);
};
