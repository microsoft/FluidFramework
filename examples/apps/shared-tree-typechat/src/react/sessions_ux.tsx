/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { Conference, Days, Session, Sessions } from "../schema/app_schema.js";
import { moveItem } from "../utils/app_helpers.js";
import { ConnectableElement, useDrop } from "react-dnd";
import { dragType } from "../utils/utils.js";
import { ClientSession } from "../schema/session_schema.js";
import { IMember, Tree } from "fluid-framework";
import { RootSessionWrapper } from "./session_ux.js";

export function SessionsView(props: {
	sessions: Sessions;
	clientId: string;
	clientSession: ClientSession;
	fluidMembers: IMember[];
	title: string;
}): JSX.Element {
	const [{ isOver, canDrop }, drop] = useDrop(() => ({
		accept: [dragType.SESSION],
		collect: (monitor) => ({
			isOver: !!monitor.isOver({ shallow: true }),
			canDrop: !!monitor.canDrop(),
		}),
		canDrop: (item) => {
			if (Tree.is(item, Session)) return true;
			return false;
		},
		drop: (item, monitor) => {
			const didDrop = monitor.didDrop();
			if (didDrop) {
				return;
			}

			const isOver = monitor.isOver({ shallow: true });
			if (!isOver) {
				return;
			}

			const droppedItem = item;
			if (Tree.is(droppedItem, Session)) {
				moveItem(droppedItem, props.sessions.length, props.sessions);
			}

			return;
		},
	}));

	function attachRef(el: ConnectableElement) {
		drop(el);
	}

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
	};

	let backgroundColor = "bg-gray-200";
	let formatting = "p-2 h-[calc(100vh-182px)] transition-all overflow-auto";
	let borderFormatting = "relative transition-all border-4 border-dashed h-fit overflow-hidden";
	const parent = Tree.parent(props.sessions);
	if (Tree.is(parent, Conference)) {
		backgroundColor = "bg-blue-200";
		formatting = `${formatting} w-[580px]`;
		borderFormatting = `${borderFormatting} w-full`;
		("relative transition-all border-4 border-dashed h-fit w-full overflow-hidden");
	} else if (Tree.is(parent, Days)) {
		formatting = `${formatting} min-w-72`;
		borderFormatting = `${borderFormatting} w-fit`;
		const grandParent = Tree.parent(parent);
		if (Tree.is(grandParent, Conference)) {
			if (props.sessions.length > grandParent.sessionsPerDay) {
				backgroundColor = "bg-red-400";
			} else if (props.sessions.length == grandParent.sessionsPerDay) {
				backgroundColor = "bg-green-200";
			}
		}
	}

	return (
		<div
			onClick={(e) => handleClick(e)}
			ref={attachRef}
			className={
				borderFormatting +
				" " +
				(isOver && canDrop ? "border-gray-500" : "border-transparent")
			}
		>
			<div className={backgroundColor + " " + formatting}>
				<SessionsTitle title={props.title} />
				<SessionsViewContent {...props} />
			</div>
			<SessionsDecoration sessions={props.sessions} />
		</div>
	);
}

function SessionsDecoration(props: { sessions: Sessions }): JSX.Element {
	const parent = Tree.parent(props.sessions);
	const formatting = "absolute bottom-6 right-6 bg-transparent font-extrabold text-7xl z-0";
	if (Tree.is(parent, Conference)) {
		return <div className={`text-blue-300 ${formatting}`}>Unscheduled</div>;
	} else {
		return <div className={`text-gray-300 ${formatting}`}>Day</div>;
	}
}

function SessionsTitle(props: { title: string }): JSX.Element {
	if (props.title === "") {
		return <></>;
	} else {
		return (
			<div className="flex flex-row justify-between">
				<div className="flex w-0 grow p-1 mb-2 mr-2 text-lg font-bold text-black bg-transparent">
					{props.title}
				</div>
			</div>
		);
	}
}

function SessionsViewContent(props: {
	sessions: Sessions;
	clientId: string;
	clientSession: ClientSession;
	fluidMembers: IMember[];
}): JSX.Element {
	const sessionsArray = [];
	for (const s of props.sessions) {
		sessionsArray.push(
			<RootSessionWrapper
				key={s.id}
				session={s}
				clientId={props.clientId}
				clientSession={props.clientSession}
				fluidMembers={props.fluidMembers}
			/>,
		);
	}

	const parent = Tree.parent(props.sessions);

	if (Tree.is(parent, Conference)) {
		return (
			<>
				<div className="flex flex-row flex-wrap w-full gap-4 p-4 content-start">
					{sessionsArray}
				</div>
			</>
		);
	} else {
		return (
			<div className="flex flex-col flex-nowrap gap-4 p-4 content-start">{sessionsArray}</div>
		);
	}
}
