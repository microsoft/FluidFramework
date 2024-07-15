/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { Fragment, useEffect, useRef, useState } from "react";
import { Conference, Session, Sessions } from "../schema/app_schema.js";
import { moveItem } from "../utils/app_helpers.js";
import { dragType, selectAction } from "../utils/utils.js";
import { testRemoteNoteSelection, updateRemoteNoteSelection } from "../utils/session_helpers.js";
import { ConnectableElement, useDrag, useDrop } from "react-dnd";
import { useTransition } from "react-transition-state";
import { IMember, Tree } from "fluid-framework";
import { ClientSession } from "../schema/session_schema.js";
import { DragFilled } from "@fluentui/react-icons";
import { Dialog, Listbox, Transition } from "@headlessui/react";
import { ShowDetailsButton } from "./button_ux.js";

export function RootSessionWrapper(props: {
	session: Session;
	clientId: string;
	clientSession: ClientSession;
	fluidMembers: IMember[];
}): JSX.Element {
	const [isDetailsOpen, setIsDetailsOpen] = useState(false);

	return (
		<div className="bg-transparent flex flex-col justify-center h-36 z-10">
			<SessionView setIsDetailsShowing={setIsDetailsOpen} {...props} />
			<SessionDetails
				isOpen={isDetailsOpen}
				setIsOpen={setIsDetailsOpen}
				session={props.session}
			/>
		</div>
	);
}

export function SessionView(props: {
	session: Session;
	clientId: string;
	clientSession: ClientSession;
	fluidMembers: IMember[];
	setIsDetailsShowing: (arg: boolean) => void;
}): JSX.Element {
	const mounted = useRef(false);
	let unscheduled = false;

	const color = "bg-white";
	const selectedColor = "bg-yellow-100";

	const parent = Tree.parent(props.session);
	if (!Tree.is(parent, Sessions)) return <></>;
	const grandParent = Tree.parent(parent);
	if (Tree.is(grandParent, Conference)) unscheduled = true;

	const [{ status }, toggle] = useTransition({
		timeout: 1000,
	});

	const [selected, setSelected] = useState(false);

	const [remoteSelected, setRemoteSelected] = useState(false);

	const [bgColor, setBgColor] = useState(color);

	const [invalidations, setInvalidations] = useState(0);

	const test = () => {
		testRemoteNoteSelection(
			props.session,
			props.clientSession,
			props.clientId,
			setRemoteSelected,
			setSelected,
			props.fluidMembers,
		);
	};

	const update = (action: selectAction) => {
		updateRemoteNoteSelection(props.session, action, props.clientSession, props.clientId);
	};

	// Register for tree deltas when the component mounts.
	// Any time the tree changes, the app will update
	// For more complex apps, this code can be included
	// on lower level components.
	useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		const unsubscribe = Tree.on(props.clientSession, "treeChanged", () => {
			setInvalidations(invalidations + Math.random());
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		test();
	}, [invalidations]);

	useEffect(() => {
		test();
	}, [props.fluidMembers]);

	useEffect(() => {
		mounted.current = true;
		test();

		return () => {
			mounted.current = false;
		};
	}, []);

	useEffect(() => {
		if (selected) {
			setBgColor(selectedColor);
		} else {
			setBgColor(color);
		}
	}, [selected]);

	toggle(false);

	useEffect(() => {
		toggle(true);
	}, [Tree.parent(props.session)]);

	useEffect(() => {
		if (mounted.current) {
			toggle(true);
		}
	}, [props.session.title, props.session.abstract]);

	const [{ isDragging }, drag] = useDrag(() => ({
		type: dragType.SESSION,
		item: props.session,
		collect: (monitor) => ({
			isDragging: monitor.isDragging(),
		}),
	}));

	const [{ isOver, canDrop }, drop] = useDrop(() => ({
		accept: [dragType.SESSION],
		collect: (monitor) => ({
			isOver: !!monitor.isOver(),
			canDrop: !!monitor.canDrop(),
		}),
		canDrop: (item) => {
			if (Tree.is(item, Session) && item !== props.session) return true;
			return false;
		},
		drop: (item) => {
			const droppedItem = item;
			if (Tree.is(droppedItem, Session) && Tree.is(parent, Sessions)) {
				moveItem(droppedItem, parent.indexOf(props.session), parent);
			}
			return;
		},
	}));

	const attachRef = (el: ConnectableElement) => {
		drag(el);
		drop(el);
	};

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (selected) {
			update(selectAction.REMOVE);
		} else if (e.shiftKey || e.ctrlKey) {
			update(selectAction.MULTI);
		} else {
			update(selectAction.SINGLE);
		}
	};

	let borderPostion = "";
	let hoverMovement = "";
	unscheduled
		? ((borderPostion = "border-l-4"), (hoverMovement = "translate-x-3"))
		: ((borderPostion = "border-t-4"), (hoverMovement = "translate-y-3"));

	return (
		<div
			onClick={(e) => handleClick(e)}
			onDoubleClick={(e) => {
				e.stopPropagation(), props.setIsDetailsShowing(true);
			}}
			className={`transition duration-500${
				status === "exiting" ? " transform ease-out scale-110" : ""
			}`}
		>
			<div
				ref={attachRef}
				className={
					isOver && canDrop
						? borderPostion + " border-dashed border-gray-500"
						: borderPostion + " border-dashed border-transparent"
				}
			>
				<div
					style={{ opacity: isDragging ? 0.5 : 1 }}
					className={
						"relative transition-all flex flex-col rounded " +
						bgColor +
						" h-32 w-60 shadow-md hover:shadow-lg p-2 " +
						" " +
						(isOver && canDrop ? hoverMovement : "")
					}
				>
					<SessionToolbar
						session={props.session}
						setIsDetailsShowing={props.setIsDetailsShowing}
					/>
					<SessionTitle session={props.session} update={update} />
					<SessionTypeLabel session={props.session} />
					<RemoteSelection show={remoteSelected} />
				</div>
			</div>
		</div>
	);
}

function RemoteSelection(props: { show: boolean }): JSX.Element {
	if (props.show) {
		return (
			<div className="absolute -top-2 -left-2 h-36 w-64 rounded border-dashed border-indigo-800 border-4" />
		);
	} else {
		return <></>;
	}
}

function SessionTitle(props: {
	session: Session;
	update: (value: selectAction) => void;
}): JSX.Element {
	// The text field updates the Fluid data model on every keystroke in this demo.
	// This works well with small strings but doesn't scale to very large strings.
	// A Future iteration of SharedTree will include support for collaborative strings
	// that make real-time collaboration on this type of data efficient and simple.

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (e.ctrlKey) {
			props.update(selectAction.MULTI);
		} else {
			props.update(selectAction.SINGLE);
		}
	};

	return (
		<textarea
			className="p-2 bg-transparent h-full w-full resize-none z-50 focus:outline-none"
			value={props.session.title}
			readOnly={true}
			onClick={(e) => handleClick(e)}
			onChange={(e) => props.session.updateTitle(e.target.value)}
		/>
	);
}

function SessionToolbar(props: {
	session: Session;
	setIsDetailsShowing: (arg: boolean) => void;
}): JSX.Element {
	return (
		<div className="flex justify-between z-50">
			<DragFilled />
			<ShowDetailsButton show={props.setIsDetailsShowing} />
		</div>
	);
}

function SessionTypeLabel(props: { session: Session }): JSX.Element {
	const sessionType = props.session.sessionType;
	let color = "";
	switch (sessionType) {
		case "keynote":
			color = "bg-red-500";
			break;
		case "panel":
			color = "bg-blue-500";
			break;
		case "session":
			color = "bg-green-500";
			break;
		case "workshop":
			color = "bg-yellow-500";
			break;
		default:
			color = "bg-gray-500";
	}

	return (
		<div
			className={`absolute -bottom-2 -right-2 h-6 w-6 rounded-full overflow-hidden shadow-md align-bottom hover:shadow-lg text-center font-bold text-white font-mono z-[1000] ${color}`}
		>
			{props.session.sessionType.substring(0, 1).toLocaleUpperCase()}
		</div>
	);
}

export default function SessionDetails(props: {
	isOpen: boolean;
	setIsOpen: (arg: boolean) => void;
	session: Session;
}): JSX.Element {
	const buttonClass = "text-white font-bold py-2 px-4 rounded";
	return (
		<Dialog
			className="absolute bg-yellow-100 rounded p-4 w-[500px] h-fit m-auto left-0 right-0 top-0 bottom-0 z-50 drop-shadow-xl"
			open={props.isOpen}
			onClose={() => props.setIsOpen(false)}
		>
			<Dialog.Panel className="w-full text-left align-middle">
				<Dialog.Title className="font-bold text-lg pb-1">Session Details</Dialog.Title>
				<div>
					<input
						className="resize-none border-2 border-gray-500 bg-white mb-2 p-2 text-black w-full h-full"
						value={props.session.title}
						onChange={(e) => {
							props.session.updateTitle(e.target.value);
						}}
					/>
					<TypeList session={props.session} />
					<textarea
						rows={5}
						className="resize-none border-2 border-gray-500 bg-white mb-2 p-2 text-black w-full h-full"
						value={props.session.abstract}
						onChange={(e) => {
							props.session.updateAbstract(e.target.value);
						}}
					/>
					<div className="flex flex-row gap-4">
						<button
							className={`bg-gray-500 hover:bg-gray-800 ${buttonClass}`}
							onClick={() => props.setIsOpen(false)}
						>
							Close
						</button>
						<button
							className={`bg-red-500 hover:bg-red-800 ${buttonClass}`}
							onClick={() => {
								props.session.delete(), props.setIsOpen(false);
							}}
						>
							Delete Session
						</button>
					</div>
				</div>
			</Dialog.Panel>
		</Dialog>
	);
}

const sessionTypes = [
	{ id: 1, name: "Keynote", value: "keynote" },
	{ id: 2, name: "Panel", value: "panel" },
	{ id: 3, name: "Session", value: "session" },
	{ id: 4, name: "Workshop", value: "workshop" },
];

function TypeList(props: { session: Session }): JSX.Element {
	const [selectedSessionType, setSelectedSessionType] = useState(
		sessionTypes[sessionTypes.findIndex((x) => x.value === props.session.sessionType)],
	);

	// Set the session type to the selected value
	useEffect(() => {
		props.session.updateSessionType(
			selectedSessionType.value as "session" | "keynote" | "panel" | "workshop",
		);
	}, [selectedSessionType]);

	return (
		<Listbox value={selectedSessionType} onChange={setSelectedSessionType}>
			<div className="relative mb-2">
				<Listbox.Button className="relative w-full cursor-pointer resize-none border-2 border-gray-500 bg-white p-2 text-black text-left focus:outline-none">
					<span className="block truncate">{selectedSessionType.name}</span>
				</Listbox.Button>
				<Transition
					as={Fragment}
					leave="transition ease-in duration-100"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<Listbox.Options className="absolute shadow-lg max-h-60 w-full overflow-auto border-2 border-gray-500 bg-white p-2 mt-1 text-black text-left">
						{sessionTypes.map((sessionTypes) => (
							<Listbox.Option
								key={sessionTypes.id}
								className={"relative cursor-pointer select-none text-black"}
								value={sessionTypes}
							>
								{sessionTypes.name}
							</Listbox.Option>
						))}
					</Listbox.Options>
				</Transition>
			</div>
		</Listbox>
	);
}
