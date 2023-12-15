/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IAudience, IContainer } from "@fluidframework/container-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { IServiceAudience, IServiceAudienceEvents, IMember, Myself } from "./types";

/**
 * @internal
 */
export function createServiceAudience<M extends IMember = IMember>(props: {
	container: IContainer;
	createServiceMember: (audienceMember: IClient) => M;
}): IServiceAudience<M> {
	return new ServiceAudience(props.container, props.createServiceMember);
}

/**
 * Base class for providing audience information for sessions interacting with {@link IFluidContainer}
 *
 * @remarks
 *
 * This can be extended by different service-specific client packages to additional parameters to
 * the user and client details returned in {@link IMember}.
 *
 * @typeParam M - A service-specific {@link IMember} implementation.
 * @internal
 */
class ServiceAudience<M extends IMember = IMember>
	extends TypedEventEmitter<IServiceAudienceEvents<M>>
	implements IServiceAudience<M>
{
	/**
	 * Audience object which includes all the existing members of the {@link IFluidContainer | container}.
	 */
	private readonly audience: IAudience;

	/**
	 * Retain the most recent member list.
	 *
	 * @remarks
	 *
	 * This is so we have more information about a member leaving the audience in the `removeMember` event.
	 *
	 * It allows us to match the behavior of the `addMember` event where it only fires on a change to the members this
	 * class exposes (and would actually produce a change in what `getMembers` returns).
	 *
	 * It also allows us to provide the client details in the event which makes it easier to find that client connection
	 * in a map keyed on the `userId` and not `clientId`.
	 *
	 * This map will always be up-to-date in a `removeMember` event because it is set once at construction and in
	 * every `addMember` event. It is mapped `clientId` to `M` to be better work with what the {@link IServiceAudience}
	 * events provide.
	 */
	private lastMembers = new Map<string, M>();

	constructor(
		/**
		 * Fluid Container to read the audience from.
		 */
		private readonly container: IContainer,
		private readonly createServiceMember: (audienceMember: IClient) => M,
	) {
		super();
		this.audience = container.audience;

		// getMembers will assign lastMembers so the removeMember event has what it needs
		// in case it would fire before getMembers otherwise gets called the first time
		this.getMembers();

		this.audience.on("addMember", (clientId: string, details: IClient) => {
			if (this.shouldIncludeAsMember(details)) {
				const member = this.getMember(clientId);
				this.emit("memberAdded", clientId, member);
				this.emit("membersChanged");
			}
		});

		this.audience.on("removeMember", (clientId: string) => {
			if (this.lastMembers.has(clientId)) {
				this.emit("memberRemoved", clientId, this.lastMembers.get(clientId));
				this.emit("membersChanged");
			}
		});

		this.container.on("connected", () => this.emit("membersChanged"));
	}

	/**
	 * {@inheritDoc IServiceAudience.getMembers}
	 */
	public getMembers(): Map<string, M> {
		const users = new Map<string, M>();
		const clientMemberMap = new Map<string, M>();
		// Iterate through the members and get the user specifics.
		this.audience.getMembers().forEach((member: IClient, clientId: string) => {
			if (this.shouldIncludeAsMember(member)) {
				const userId = member.user.id;
				// Ensure we're tracking the user
				let user = users.get(userId);
				if (user === undefined) {
					user = this.createServiceMember(member);
					users.set(userId, user);
				}

				// Add this connection to their collection
				user.connections.push({ id: clientId, mode: member.mode });
				clientMemberMap.set(clientId, user);
			}
		});
		this.lastMembers = clientMemberMap;
		return users;
	}

	/**
	 * {@inheritDoc IServiceAudience.getMyself}
	 */
	public getMyself(): Myself<M> | undefined {
		const clientId = this.container.clientId;
		if (clientId === undefined) {
			return undefined;
		}

		const member = this.getMember(clientId);
		if (member === undefined) {
			return undefined;
		}

		const myself: Myself<M> = { ...member, currentConnection: clientId };

		return myself;
	}

	private getMember(clientId: string): M | undefined {
		// Fetch the user ID assoicated with this client ID from the runtime
		const internalAudienceMember = this.audience.getMember(clientId);
		if (internalAudienceMember === undefined) {
			return undefined;
		}
		// Return the member object with any other clients associated for this user
		const allMembers = this.getMembers();
		const member = allMembers.get(internalAudienceMember?.user.id);
		if (member === undefined) {
			throw Error(
				`Attempted to fetch client ${clientId} that is not part of the current member list`,
			);
		}
		return member;
	}

	/**
	 * Provides ability for the inheriting class to include/omit specific members.
	 * An example use case is omitting the summarizer client.
	 *
	 * @param member - Member to be included/omitted.
	 */
	private shouldIncludeAsMember(member: IClient): boolean {
		// Include only human members
		return member.details.capabilities.interactive;
	}
}
