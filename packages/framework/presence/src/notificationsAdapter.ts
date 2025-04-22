/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalTypes } from "./exposedInternalTypes.js";
import type { NotificationsManager } from "./notificationsManager.js";
import type { Presence } from "./presence.js";
import type {
	NotificationsWorkspace,
	NotificationsWorkspaceSchema,
	StatesWorkspace,
	StatesWorkspaceEntries,
} from "./types.js";

/**
 * Adapter class to convert StatesWorkspace to NotificationsWorkspace
 *
 * @internal
 */
export class NotificationsWorkspaceAdapter<TSchema extends NotificationsWorkspaceSchema>
	implements NotificationsWorkspace<TSchema>
{
	public constructor(private readonly statesWorkspace: StatesWorkspace<TSchema>) {}

	public get notifications(): StatesWorkspaceEntries<TSchema> {
		return this.statesWorkspace.states; // Access the states property of the wrapped workspace
	}

	public get presence(): Presence {
		return this.statesWorkspace.presence;
	}

	public add<
		TKey extends string,
		TValue extends InternalTypes.ValueDirectoryOrState<any>,
		TManager extends NotificationsManager<any>,
	>(
		key: TKey,
		manager: InternalTypes.ManagerFactory<TKey, TValue, TManager>,
	): asserts this is NotificationsWorkspace<
		TSchema & Record<TKey, InternalTypes.ManagerFactory<TKey, TValue, TManager>>
	> {
		this.statesWorkspace.add(key, manager);
	}
}
