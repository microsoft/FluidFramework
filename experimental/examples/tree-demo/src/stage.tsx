/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Snapshot } from "@fluid-experimental/tree";
import React from "react";
import { BubbleView } from "./bubble";
import { ClientManager } from "./model";

export interface IStage {
    width: number;
    height: number;
}

export interface IStageProps {
    width: number;
    height: number;
    tree: Snapshot;
    mgr: ClientManager;
}

export const StageView: React.FC<IStageProps> = ({ width, height, tree, mgr }: IStageProps) => {
    const bubbles: JSX.Element[] = [];

    mgr.forEachClient(tree, (clientProxy) => {
        const color = clientProxy.color;
        bubbles.splice(
            bubbles.length,
            0,
            ...clientProxy.bubbles.map(
                (id) => <BubbleView key={id} tree={tree} id={id} color={color}></BubbleView>));
    });

    return (
        <svg id="stage" xmlns="http://www.w3.org/2000/svg" version="1.1"
            style={{ position: "absolute", width: "100%", height: "100%", top: "0px" }}>
            { bubbles }
        </svg>
    );
};
