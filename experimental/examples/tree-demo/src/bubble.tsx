/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { NodeId, Snapshot } from "@fluid-experimental/tree";
import { BubbleProxy } from "./model";

const bubbleProxy = new BubbleProxy();

export interface IBubbleProps {
    tree: Snapshot;
    id: NodeId;
    color: string;
}

export const BubbleView: React.FC<IBubbleProps> = ({ tree, id, color }: IBubbleProps) => {
    bubbleProxy.moveTo(tree, id);

    return (
        <g transform={`translate(${bubbleProxy.x},${bubbleProxy.y}) scale(${bubbleProxy.r})`}>
            <circle r="1"
                fill={color}
                fillOpacity="0.3"
                stroke={color}
                strokeWidth="0.1"
                strokeOpacity="0.5">
            </circle>
            <circle r="1" fill={color} fillOpacity="0.05"></circle>
            <ellipse
                cx="-0.38"
                cy="-0.46"
                rx="0.19"
                ry="0.30"
                transform={`rotate(50,-0.38,-0.46)`} fill="white" />
        </g>);
};
