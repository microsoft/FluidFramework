/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { BubbleView, IBubble } from "./bubble";

export interface IStage {
    width: number;
    height: number;
}

export interface IStageProps {
    width: number;
    height: number;
    bubbles: IBubble[];
}

export const StageView: React.FC<IStageProps> = (props: IStageProps) =>
    <svg xmlns="http://www.w3.org/2000/svg" version="1.1" width={props.width} height={props.height}>
        { props.bubbles.map((bubble, index) => <BubbleView key={index} data={bubble}></BubbleView>) }
    </svg>;
