/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeConfiguration, SchemaFactory, Tree } from "fluid-framework";
import { v4 as uuid } from "uuid";

// Schema is defined using a factory object that generates classes for objects as well
// as list and map nodes.

// Include a UUID to guarantee that this schema will be uniquely identifiable.
const sf = new SchemaFactory("a7245fab-24f7-489d-a726-4ff3ee793719");

// Define the schema for the session object.
// Helper functions for working with the data contained in this object
// are included in this class definition as methods.
export class Session extends sf.object(
	"Session",
	// Fields for sessions which SharedTree will store and synchronize across clients.
	// These fields are exposed as members of instances of the Session class.
	{
		id: sf.string,
		title: sf.string,
		abstract: sf.string,
		sessionType: sf.string,
		created: sf.number,
		lastChanged: sf.number,
	},
) {
	// Update the title text and also update the timestamp
	public updateTitle(text: string) {
		this.lastChanged = new Date().getTime();
		this.title = text;
	}

	// Update the abstract text and also update the timestamp
	public updateAbstract(text: string) {
		this.lastChanged = new Date().getTime();
		this.abstract = text;
	}

	// Update the session type and also update the timestamp
	public updateSessionType(type: keyof typeof SessionType) {
		this.lastChanged = new Date().getTime();
		this.sessionType = type;
	}

	/**
	 * Removes a node from its parent.
	 */
	public delete() {
		const parent = Tree.parent(this);
		// Use type narrowing to ensure that parent is correct.
		if (Tree.is(parent, Sessions)) {
			const index = parent.indexOf(this);
			parent.removeAt(index);
		}
	}
}

const SessionType = {
	session: "Session",
	workshop: "Workshop",
	panel: "Panel",
	keynote: "Keynote",
};

export class Sessions extends sf.array("Sessions", Session) {
	// Add a session to the conference
	public addSession() {
		const currentTime = new Date().getTime();
		const session = new Session({
			id: uuid(),
			title: "New Session",
			abstract: "New Abstract",
			sessionType: "session",
			created: currentTime,
			lastChanged: currentTime,
		});
		this.insertAtEnd(session);
		return session;
	}
}

export class Days extends sf.array("Days", Sessions) {
	// Add a day to the conference
	public addDay(): Sessions {
		const day = new Sessions([]);
		this.insertAtEnd(day);
		return day;
	}

	// Remove the last day from the conference
	public removeDay() {
		if (this.length === 0) {
			return;
		}
		// Get the conference object from the parent of this map
		const conference = Tree.parent(this);
		// Get the sessions array from the conference object
		// and move all the sessions in the Day to the sessions array
		if (Tree.is(conference, Conference)) {
			const sessions = conference?.sessions;
			const lastDay = this[this.length - 1];
			if (lastDay) {
				Tree.runTransaction<Days>(this, () => {
					// Move all the sessions in the Day to the sessions array
					if (lastDay.length !== 0) {
						const index = sessions.length;
						sessions.moveRangeToIndex(index, 0, lastDay.length, lastDay);
					}
					// Remove the day from the conference
					this.removeAt(this.length - 1);
				});
			}
		}
	}
}

export class Conference extends sf.object("Conference", {
	name: sf.string,
	sessions: Sessions,
	days: Days,
	sessionsPerDay: sf.number,
}) {
	// Clear all the sessions from the conference
	public clear() {
		Tree.runTransaction<Conference>(this, () => {
			if (this.sessions.length > 0) this.sessions.removeRange();
			if (this.days.length > 0) this.days.removeRange();
		});
	}
}

// Export the tree config appropriate for this schema.
// This is passed into the SharedTree when it is initialized.
export const appTreeConfiguration = new TreeConfiguration(
	// Schema for the root
	Conference,
	// initial tree
	() => new Conference({ name: "Conference", sessions: [], days: [], sessionsPerDay: 4 }),
);
