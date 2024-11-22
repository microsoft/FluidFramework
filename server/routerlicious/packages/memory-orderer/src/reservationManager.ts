/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ICollection, MongoManager } from "@fluidframework/server-services-core";
import { IConcreteNode, IReservationManager } from "./interfaces";
import { NodeManager } from "./nodeManager";

/**
 * Reservation for the given id within the system. The reservation is considered held for as long as the node
 * maintains the given epoch
 * @internal
 */
export interface IReservation {
	_id: string;

	node: string;
}

/**
 * @internal
 */
export class ReservationManager extends EventEmitter implements IReservationManager {
	constructor(
		private readonly nodeTracker: NodeManager,
		private readonly mongoManager: MongoManager,
		private readonly reservationColletionName: string,
	) {
		super();
	}

	public async getOrReserve(key: string, node: IConcreteNode): Promise<IConcreteNode> {
		const reservations = await this.getReservationsCollection();
		const reservation = await reservations.findOne({ _id: key });

		// Reservation can be null (first time), expired, or existing and within the time window
		if (reservation === null) {
			await this.makeReservation(node, key, undefined, reservations);
			return node;
		} else {
			const remoteNode = await this.nodeTracker.loadRemote(reservation.node);
			if (remoteNode.valid) {
				return remoteNode;
			} else {
				await this.makeReservation(node, key, reservation, reservations);
				return node;
			}
		}
	}

	private async makeReservation(
		node: IConcreteNode,
		key: string,
		existing: IReservation | undefined,
		collection: ICollection<IReservation>,
	): Promise<any> {
		const newReservation: IReservation = { _id: key, node: node.id };

		await (existing !== undefined
			? collection.update({ _id: key, node: existing.node }, newReservation, null)
			: collection.insertOne(newReservation));
	}

	private async getReservationsCollection(): Promise<ICollection<IReservation>> {
		const db = await this.mongoManager.getDatabase();
		return db.collection<IReservation>(this.reservationColletionName);
	}
}
