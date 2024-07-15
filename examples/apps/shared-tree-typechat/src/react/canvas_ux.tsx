/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import { Conference } from "../schema/app_schema.js";
import { ClientSession } from "../schema/session_schema.js";
import {
	ConnectionState,
	IFluidContainer,
	IMember,
	IServiceAudience,
	Tree,
	TreeView,
} from "fluid-framework";
import { RootSessionWrapper } from "./session_ux.js";
import {
	Floater,
	NewDayButton,
	NewSessionButton,
	ButtonGroup,
	UndoButton,
	RedoButton,
	DeleteDayButton,
	ShowPromptButton,
	Divider,
	DeleteSessionsButton,
} from "./button_ux.js";
import { undoRedo } from "../utils/undo.js";
import { SessionsView } from "./sessions_ux.js";

export function Canvas(props: {
	conferenceTree: TreeView<typeof Conference>;
	sessionTree: TreeView<typeof ClientSession>;
	audience: IServiceAudience<IMember>;
	container: IFluidContainer;
	fluidMembers: IMember[];
	currentUser: IMember | undefined;
	undoRedo: undoRedo;
	setCurrentUser: (arg: IMember) => void;
	setConnectionState: (arg: string) => void;
	setSaved: (arg: boolean) => void;
	setFluidMembers: (arg: IMember[]) => void;
	setShowPrompt: (arg: boolean) => void;
}): JSX.Element {
	const [invalidations, setInvalidations] = useState(0);

	// Register for tree deltas when the component mounts.
	// Any time the tree changes, the app will update
	// For more complex apps, this code can be included
	// on lower level components.
	useEffect(() => {
		const unsubscribe = Tree.on(props.conferenceTree.root, "treeChanged", () => {
			setInvalidations(invalidations + Math.random());
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		const updateConnectionState = () => {
			if (props.container.connectionState === ConnectionState.Connected) {
				props.setConnectionState("connected");
			} else if (props.container.connectionState === ConnectionState.Disconnected) {
				props.setConnectionState("disconnected");
			} else if (props.container.connectionState === ConnectionState.EstablishingConnection) {
				props.setConnectionState("connecting");
			} else if (props.container.connectionState === ConnectionState.CatchingUp) {
				props.setConnectionState("catching up");
			}
		};
		updateConnectionState();
		props.setSaved(!props.container.isDirty);
		props.container.on("connected", updateConnectionState);
		props.container.on("disconnected", updateConnectionState);
		props.container.on("dirty", () => props.setSaved(false));
		props.container.on("saved", () => props.setSaved(true));
		props.container.on("disposed", updateConnectionState);
	}, []);

	const updateMembers = () => {
		if (props.audience.getMyself() == undefined) return;
		if (props.audience.getMyself()?.userId == undefined) return;
		if (props.audience.getMembers() == undefined) return;
		if (props.container.connectionState !== ConnectionState.Connected) return;
		if (props.currentUser === undefined) {
			const user = props.audience.getMyself();
			if (user !== undefined) {
				props.setCurrentUser(user);
			}
		}
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		props.setFluidMembers(Array.from(props.audience.getMembers()).map(([_, member]) => member));
	};

	useEffect(() => {
		props.audience.on("membersChanged", updateMembers);
		return () => {
			props.audience.off("membersChanged", updateMembers);
		};
	}, []);

	const clientId = props.currentUser?.userId ?? "";

	return (
		<div className="relative flex grow-0 h-full w-full bg-transparent">
			<ConferenceView
				conference={props.conferenceTree.root}
				clientId={clientId}
				clientSession={props.sessionTree.root}
				fluidMembers={props.fluidMembers}
			/>
			<Floater>
				<ButtonGroup>
					<NewSessionButton conference={props.conferenceTree.root} clientId={clientId} />
					<NewDayButton
						days={props.conferenceTree.root.days}
						session={props.sessionTree.root}
						clientId={clientId}
					/>
					<DeleteDayButton
						days={props.conferenceTree.root.days}
						session={props.sessionTree.root}
						clientId={clientId}
					/>
				</ButtonGroup>
				<Divider />
				<ButtonGroup>
					<DeleteSessionsButton
						conference={props.conferenceTree.root}
						clientId={clientId}
					/>
				</ButtonGroup>
				<Divider />
				<ButtonGroup>
					<ShowPromptButton show={props.setShowPrompt} />
				</ButtonGroup>
				<Divider />
				<ButtonGroup>
					<UndoButton undo={() => props.undoRedo.undo()} />
					<RedoButton redo={() => props.undoRedo.redo()} />
				</ButtonGroup>
			</Floater>
		</div>
	);
}

export function ConferenceView(props: {
	conference: Conference;
	clientId: string;
	clientSession: ClientSession;
	fluidMembers: IMember[];
}): JSX.Element {
	const sessionArray = [];
	for (const i of props.conference.sessions) {
		sessionArray.push(
			<RootSessionWrapper
				key={i.id}
				session={i}
				clientId={props.clientId}
				clientSession={props.clientSession}
				fluidMembers={props.fluidMembers}
			/>,
		);
	}

	return (
		<div className="h-full w-full overflow-auto">
			<div className="flex flex-row h-full w-full content-start">
				<div className="flex h-full w-fit p-4">
					<SessionsView sessions={props.conference.sessions} title="" {...props} />
				</div>
				<div className="flex flex-row h-full w-full flex-nowrap gap-4 p-4 content-start">
					<DaysView {...props} />
				</div>
			</div>
		</div>
	);
}

// React component that renders each day in the conference side by side
export function DaysView(props: {
	conference: Conference;
	clientId: string;
	clientSession: ClientSession;
	fluidMembers: IMember[];
}): JSX.Element {
	const dayArray = [];
	for (const day of props.conference.days) {
		dayArray.push(
			<SessionsView
				key={Tree.key(day)}
				sessions={day}
				clientSession={props.clientSession}
				clientId={props.clientId}
				fluidMembers={props.fluidMembers}
				title={"Day " + ((Tree.key(day) as number) + 1)}
			/>,
		);
	}

	return <>{dayArray}</>;
}
