/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { Conference, Days } from "../schema/app_schema.js";
import { findSession } from "../utils/app_helpers.js";
import {
	ThumbLikeFilled,
	DismissFilled,
	NoteRegular,
	DeleteRegular,
	ArrowUndoFilled,
	ArrowRedoFilled,
	StarFilled,
	CalendarAddFilled,
	CalendarCancelFilled,
	MoreVerticalFilled,
} from "@fluentui/react-icons";
import { ClientSession } from "../schema/session_schema.js";
import { getSelectedSessions } from "../utils/session_helpers.js";
import { Tree } from "fluid-framework";

export function NewDayButton(props: {
	days: Days;
	session: ClientSession;
	clientId: string;
}): JSX.Element {
	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		props.days.addDay();
	};
	return (
		<IconButton
			color="white"
			background="black"
			handleClick={(e: React.MouseEvent) => handleClick(e)}
			icon={<CalendarAddFilled />}
		>
			Add Day
		</IconButton>
	);
}

export function DeleteDayButton(props: {
	days: Days;
	session: ClientSession;
	clientId: string;
}): JSX.Element {
	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		props.days.removeDay();
	};
	return (
		<IconButton
			color="white"
			background="black"
			handleClick={(e: React.MouseEvent) => handleClick(e)}
			icon={<CalendarCancelFilled />}
		>
			Remove Day
		</IconButton>
	);
}

export function NewSessionButton(props: { conference: Conference; clientId: string }): JSX.Element {
	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		props.conference.sessions.addSession();
	};

	return (
		<IconButton
			color="white"
			background="black"
			handleClick={(e: React.MouseEvent) => handleClick(e)}
			icon={<NoteRegular />}
		>
			New Session
		</IconButton>
	);
}

export function DeleteSessionsButton(props: {
	conference: Conference;
	clientId: string;
}): JSX.Element {
	const handleClick = () => {
		props.conference.clear();
	};
	return (
		<IconButton
			color="white"
			background="red"
			handleClick={() => handleClick()}
			icon={<DeleteRegular />}
		>
			Clear
		</IconButton>
	);
}

export function UndoButton(props: { undo: () => void }): JSX.Element {
	return (
		<IconButton
			color="white"
			background="black"
			handleClick={() => props.undo()}
			icon={<ArrowUndoFilled />}
		>
			Undo
		</IconButton>
	);
}

export function RedoButton(props: { redo: () => void }): JSX.Element {
	return (
		<IconButton
			color="white"
			background="black"
			handleClick={() => props.redo()}
			icon={<ArrowRedoFilled />}
		>
			Redo
		</IconButton>
	);
}

export function DeleteButton(props: {
	handleClick: (value: React.MouseEvent) => void;
}): JSX.Element {
	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		props.handleClick(e);
	};
	return (
		<button
			className={
				"bg-transparent hover:bg-gray-600 text-black hover:text-white font-bold px-2 py-1 rounded inline-flex items-center h-6"
			}
			onClick={(e) => handleClick(e)}
		>
			{MiniX()}
		</button>
	);
}

export function ShowDetailsButton(props: { show: (show: boolean) => void }): JSX.Element {
	return (
		<MoreVerticalFilled
			className="bg-transparent hover:bg-gray-600 text-black hover:text-white rounded"
			color="black"
			onClick={() => props.show(true)}
		/>
	);
}

export function ShowPromptButton(props: { show: (arg: boolean) => void }): JSX.Element {
	return (
		<IconButton
			color="white"
			background="black"
			handleClick={() => props.show(true)}
			icon={<StarFilled />}
		>
			Get Started...
		</IconButton>
	);
}

export function IconButton(props: {
	handleClick: (value: React.MouseEvent) => void;
	children?: React.ReactNode;
	icon: JSX.Element;
	color?: string;
	background?: string;
}): JSX.Element {
	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		props.handleClick(e);
	};

	return (
		<button
			className={
				props.color +
				" " +
				props.background +
				" hover:bg-gray-600 hover:text-white font-bold px-2 py-1 rounded inline-flex items-center h-6 grow"
			}
			onClick={(e) => handleClick(e)}
		>
			{props.icon}
			<IconButtonText>{props.children}</IconButtonText>
		</button>
	);
}

IconButton.defaultProps = {
	color: "text-gray-600",
	background: "bg-transparent",
};

function IconButtonText(props: { children: React.ReactNode }): JSX.Element {
	if (props.children == undefined) {
		return <span></span>;
	} else {
		return <span className="text-sm pl-2 leading-none">{props.children}</span>;
	}
}

function MiniX(): JSX.Element {
	return <DismissFilled />;
}

export function MiniThumb(): JSX.Element {
	return <ThumbLikeFilled />;
}

export function ButtonGroup(props: { children: React.ReactNode }): JSX.Element {
	return <div className="flex flex-intial items-center">{props.children}</div>;
}

export function Divider(): JSX.Element {
	return <div className="border-r border-gray-400 border-1 h-6"></div>;
}

export function Floater(props: { children: React.ReactNode }): JSX.Element {
	return (
		<div className="transition transform absolute z-[1000] bottom-4 inset-x-0 pb-2 sm:pb-5 opacity-100 scale-100 translate-y-0 ease-out duration-500 text-white">
			<div className="max-w-screen-md mx-auto px-2 sm:px-4">
				<div className="p-2 rounded-lg bg-black shadow-lg sm:p-3">
					<div className="flex flex-row items-center justify-between flex-wrap">
						{props.children}
					</div>
				</div>
			</div>
		</div>
	);
}
