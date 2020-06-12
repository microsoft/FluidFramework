/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

const renderTriangleToCanvas = (ctx: CanvasRenderingContext2D, c1: ICoordinate, c2: ICoordinate, c3: ICoordinate) => {
    ctx.clearRect(0, 0, 100, 100);
    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.fill();
};

interface ITriangleViewProps {
    coordinate1: ICoordinate;
    coordinate2: ICoordinate;
    coordinate3: ICoordinate;
}

export const TriangleView: React.FC<ITriangleViewProps> = (props: ITriangleViewProps) => {
    const canvasRef = React.createRef<HTMLCanvasElement>();
    const rerenderCanvas = () => {
        if (canvasRef.current !== null) {
            const ctx = canvasRef.current.getContext("2d");
            if (ctx !== null) {
                renderTriangleToCanvas(ctx, props.coordinate1, props.coordinate2, props.coordinate3);
            }
        }
    }
    React.useEffect(() => {
        if (canvasRef.current !== null) {
            canvasRef.current.width = 100;
            canvasRef.current.height = 100;
        }
        rerenderCanvas();

        props.coordinate1.on("coordinateChanged", rerenderCanvas);
        props.coordinate2.on("coordinateChanged", rerenderCanvas);
        props.coordinate3.on("coordinateChanged", rerenderCanvas);
        return () => {
            props.coordinate1.off("coordinateChanged", rerenderCanvas);
            props.coordinate2.off("coordinateChanged", rerenderCanvas);
            props.coordinate3.off("coordinateChanged", rerenderCanvas);
        }
    });

    return (
        <canvas className="triangle-canvas" ref={ canvasRef }></canvas>
    );
}
