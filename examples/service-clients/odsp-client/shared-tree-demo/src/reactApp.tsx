/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable prefer-template */

import React, { ReactNode, useEffect, useState } from "react";
import { TreeView, Tree } from "@fluid-experimental/tree2";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { App, Letter } from "./schema";

export function Explanation(): JSX.Element {
	return (
		<div className="flex flex-col max-w-md gap-4 justify-left my-32 select-none">
			<BlackBox>
				Copy the full URL to another browser tab or send it to someone to see that the data
				is synched between clients.
			</BlackBox>
		</div>
	);
}

export function BlackBox(props: { children: ReactNode }): JSX.Element {
	return (
		<div className="text-xl bg-black text-white p-4 rounded shadow-md">{props.children}</div>
	);
}

function CanvasLetter(props: {
	app: App;
	letter: Letter;
	cellSize: { x: number; y: number };
}): JSX.Element {
	const style: React.CSSProperties = {
		left: `${props.letter.position.x}px`,
		top: `${props.letter.position.y}px`,
		width: `${props.cellSize.x}px`,
		height: `${props.cellSize.y}px`,
	};

	return (
		<div
			className="transition-all hover:scale-110 text-center cursor-pointer select-none absolute text-xl"
			style={style}
			onClick={(): void => {
				const index: number = props.app.letters.indexOf(props.letter);
				if (index !== -1) props.app.word.moveToEnd(index, props.app.letters);
			}}
		>
			{props.letter.character}
		</div>
	);
}

function TopLetter(props: { app: App; letter: Letter }): JSX.Element {
	const [isWinner, setIsWinner] = useState(false);

	useEffect(() => {
		const topRow = props.app.word
			.map((letter) => {
				return letter.character;
			})
			.join("");
		if (topRow === "HELLO" || topRow === "HELLOWORLD" || topRow === "WORLD") {
			setIsWinner(true);
		} else {
			setIsWinner(false);
		}
	}, [props.app.word.length]);

	const classes = `transition-all text-center cursor-pointer select-none tracking-widest text-2xl ${
		isWinner ? " font-extrabold text-3xl" : " animate-bounce text-2xl"
	}`;

	return (
		<div
			className={classes}
			onClick={(): void => {
				const index = props.app.word.indexOf(props.letter);
				if (index !== -1) props.app.letters.moveToEnd(index, props.app.word);
			}}
		>
			{props.letter.character}
		</div>
	);
}

function Canvas(props: {
	app: App;
	cellSize: { x: number; y: number };
	canvasSize: { x: number; y: number };
}): JSX.Element {
	const style: React.CSSProperties = {
		width: (props.cellSize.x * props.canvasSize.x).toString() + `px`,
		height: (props.cellSize.y * props.canvasSize.y).toString() + `px`,
	};

	return (
		<div
			className="relative w-full h-full self-center bg-transparent"
			style={style}
			onClick={(e: React.MouseEvent): void => {
				e.preventDefault();
			}}
		>
			{props.app.letters.map((letter) => (
				<CanvasLetter
					key={letter.id}
					app={props.app}
					letter={letter}
					cellSize={props.cellSize}
				/>
			))}
		</div>
	);
}

function TopRow(props: { app: App }): JSX.Element {
	return (
		<div className="flex justify-center bg-gray-300 p-4 gap-1 h-16 w-full ">
			{props.app.word.map((letter) => (
				<TopLetter key={letter.id} app={props.app} letter={letter} />
			))}
		</div>
	);
}

export function ReactApp(props: {
	data: TreeView<App>;
	container: IFluidContainer;
	cellSize: { x: number; y: number };
	canvasSize: { x: number; y: number };
}): JSX.Element {
	const [invalidations, setInvalidations] = useState(0);

	const appRoot = props.data.root;

	// Register for tree deltas when the component mounts.
	// Any time the tree changes, the app will update
	// For more complex apps, this code can be included
	// on lower level components.
	useEffect(() => {
		const unsubscribe = Tree.on(appRoot, "afterChange", () => {
			setInvalidations(invalidations + Math.random());
		});
		return unsubscribe;
	}, []);

	return (
		<div className="flex flex-col justify-items-center items-center w-full h-full">
			<TopRow app={appRoot} />
			<Canvas app={appRoot} canvasSize={props.canvasSize} cellSize={props.cellSize} />
			<Explanation />
		</div>
	);
}
