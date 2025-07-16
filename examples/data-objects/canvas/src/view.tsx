/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IColor } from "@fluid-experimental/ink";
import { InkCanvas } from "@fluid-experimental/ink";
import React, { useEffect, useRef, useState } from "react";

import type { Canvas } from "./canvas.js";
// eslint-disable-next-line import/no-unassigned-import
import "./style.less";

const colorPickerColors: IColor[] = [
	{ r: 253, g: 0, b: 12, a: 1 },
	{ r: 134, g: 0, b: 56, a: 1 },
	{ r: 253, g: 187, b: 48, a: 1 },
	{ r: 255, g: 255, b: 81, a: 1 },
	{ r: 0, g: 45, b: 98, a: 1 },
	{ r: 255, g: 255, b: 255, a: 1 },
	{ r: 246, g: 83, b: 20, a: 1 },
	{ r: 0, g: 161, b: 241, a: 1 },
	{ r: 124, g: 187, b: 0, a: 1 },
	{ r: 8, g: 170, b: 51, a: 1 },
	{ r: 0, g: 0, b: 0, a: 1 },
];

interface IToolbarProps {
	toggleColorPicker: () => void;
	replayInk: () => void;
	clearInk: () => void;
}

const Toolbar: React.FC<IToolbarProps> = (props: IToolbarProps) => {
	const { toggleColorPicker, replayInk, clearInk } = props;
	return (
		<div className="ink-toolbar">
			<button
				className="ink-toolbar-button fluid-icon-pencil"
				title="Change Color"
				onClick={toggleColorPicker}
			></button>
			<button
				className="ink-toolbar-button fluid-icon-replay"
				title="Replay"
				onClick={replayInk}
			></button>
			<button
				className="ink-toolbar-button fluid-icon-cross"
				title="Clear"
				onClick={clearInk}
			></button>
		</div>
	);
};

interface IColorOptionProps {
	color: IColor;
	choose: () => void;
}

const ColorOption: React.FC<IColorOptionProps> = (props: IColorOptionProps) => {
	const { color, choose } = props;
	return (
		<button
			className="ink-color-option"
			onClick={choose}
			style={{ backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})` }}
		></button>
	);
};

interface IColorPickerProps {
	show: boolean;
	choose: (color: IColor) => void;
}

const ColorPicker: React.FC<IColorPickerProps> = (props: IColorPickerProps) => {
	const { show, choose } = props;
	return (
		<div className={`ink-color-picker${show ? " show" : ""}`}>
			{colorPickerColors.map((color, index) => {
				const pickColor = (): void => {
					choose(color);
				};
				return <ColorOption key={index} color={color} choose={pickColor} />;
			})}
		</div>
	);
};

interface ICanvasViewProps {
	canvas: Canvas;
}

export const CanvasView: React.FC<ICanvasViewProps> = (props: ICanvasViewProps) => {
	const { canvas } = props;
	const [inkCanvas, setInkCanvas] = useState<InkCanvas | undefined>();
	const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (canvasRef.current !== null && inkCanvas === undefined) {
			setInkCanvas(new InkCanvas(canvasRef.current, canvas.ink));
		}
	}, [canvas, canvasRef.current]);

	useEffect(() => {
		if (inkCanvas !== undefined) {
			const resizeHandler = (): void => {
				inkCanvas.sizeCanvasBackingStore();
			};
			window.addEventListener("resize", resizeHandler);
			inkCanvas.sizeCanvasBackingStore();
			return (): void => {
				window.removeEventListener("resize", resizeHandler);
			};
		}
	}, [inkCanvas]);

	const toggleColorPicker = (): void => {
		setShowColorPicker(!showColorPicker);
	};
	const replayInk = inkCanvas?.replay.bind(inkCanvas) ?? ((): void => {});
	const clearInk = inkCanvas?.clear.bind(inkCanvas) ?? ((): void => {});
	const chooseColor = (color: IColor): void => {
		inkCanvas?.setPenColor(color);
		setShowColorPicker(false);
	};
	return (
		<div className="ink-component-root">
			<div className="ink-surface">
				<canvas className="ink-canvas" ref={canvasRef}></canvas>
				<Toolbar
					toggleColorPicker={toggleColorPicker}
					replayInk={replayInk}
					clearInk={clearInk}
				/>
			</div>
			<ColorPicker show={showColorPicker} choose={chooseColor} />
		</div>
	);
};
