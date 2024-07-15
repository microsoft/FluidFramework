/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMember } from "fluid-framework";
import { Session } from "../schema/app_schema.js";
import { ClientSession, Client } from "../schema/session_schema.js";
import { selectAction, undefinedUserId } from "./utils.js";

export const testRemoteNoteSelection = (
	item: Session,
	session: ClientSession,
	clientId: string,
	setRemoteSelected: (value: boolean) => void,
	setSelected: (value: boolean) => void,
	fluidMembers: IMember[],
) => {
	if (clientId == undefinedUserId) return;

	let selected = false;
	let remoteSelected = false;

	for (const c of session.clients) {
		if (c.clientId == clientId) {
			if (c.selected.indexOf(item.id) != -1) {
				selected = true;
			}
		}

		if (c.clientId != clientId && fluidMembers.some((member) => member.userId === c.clientId)) {
			if (c.selected.indexOf(item.id) != -1) {
				remoteSelected = true;
			}
		}
	}
	setRemoteSelected(remoteSelected);
	setSelected(selected);
};

export const updateRemoteNoteSelection = (
	item: Session,
	action: selectAction,
	session: ClientSession,
	clientId: string,
) => {
	if (clientId == undefinedUserId) return;

	// Handle removed items and bail
	if (action == selectAction.REMOVE) {
		for (const c of session.clients) {
			if (c.clientId === clientId) {
				const i = c.selected.indexOf(item.id);
				if (i != -1) c.selected.removeAt(i);
				return;
			}
		}
		return;
	}

	if (action == selectAction.MULTI) {
		for (const c of session.clients) {
			if (c.clientId === clientId) {
				const i = c.selected.indexOf(item.id);
				if (i == -1) c.selected.insertAtEnd(item.id);
				return;
			}
		}
	}

	if (action == selectAction.SINGLE) {
		console.log(clientId);
		for (const c of session.clients) {
			if (c.clientId === clientId) {
				if (c.selected.length > 0) c.selected.removeRange(0);
				c.selected.insertAtStart(item.id);
				return;
			}
		}
	}

	const s = new Client({
		clientId: clientId,
		selected: [item.id],
	});

	session.clients.insertAtEnd(s);
};

export const getSelectedSessions = (clientSession: ClientSession, clientId: string): string[] => {
	for (const c of clientSession.clients) {
		if (c.clientId == clientId) {
			return c.selected.concat();
		}
	}
	return [];
};

export const cleanSessionData = (session: ClientSession, fluidMembers: string[]) => {
	const deleteMe: Client[] = [];
	for (const c of session.clients) {
		if (!fluidMembers.includes(c.clientId)) {
			deleteMe.push(c);
		}
	}

	for (const c of deleteMe) {
		session.clients.removeAt(session.clients.indexOf(c));
	}
};
