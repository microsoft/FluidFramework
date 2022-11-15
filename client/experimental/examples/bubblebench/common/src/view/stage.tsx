/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { IAppState } from "../types";
import { BubbleView } from "./bubble";

export interface IStage {
    width: number;
    height: number;
}

export interface IStageProps {
    app: IAppState;
}

export const StageView: React.FC<IStageProps> = ({ app }: IStageProps) => {
    const groups: JSX.Element[] = [];

    for (const client of app.clients) {
        const color = client.color;

        groups.push(<g key={client.color} fill={color} stroke={color}>
            {client.bubbles.map(({ x, y, r }, index) => {
                return <BubbleView key={index} x={x} y={y} r={r}></BubbleView>;
            })}
        </g>);
    }

    return (
        <svg id="stage" xmlns="http://www.w3.org/2000/svg" version="1.1"
            style={{ position: "absolute", width: "100%", height: "100%", top: "0px" }}>
            { groups }
        </svg>
    );
};
