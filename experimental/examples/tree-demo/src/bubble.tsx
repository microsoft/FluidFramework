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
    const r = bubbleProxy.r;

    return (
        <g transform={`translate(${bubbleProxy.x},${bubbleProxy.y})`}>
            <circle r={r}
                fill={color}
                fillOpacity={0.3}
                stroke={color}
                strokeWidth={r * 0.1}
                strokeOpacity={0.5}>
            </circle>
            <circle r={r * 0.88} fill={color} fillOpacity={0.05}></circle>
            <ellipse
                cx={r * -0.38}
                cy={r * -0.46}
                rx={r * 0.19}
                ry={r * 0.30}
                transform={`rotate(50,${r * -0.38},${r * -0.46})`} fill="white" />
        </g>);
};
