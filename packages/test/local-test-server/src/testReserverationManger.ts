/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConcreteNode,
    IConcreteNodeFactory,
    IReservation,
    IReservationManager,
} from "@microsoft/fluid-server-memory-orderer";
import { ICollection, MongoManager } from "@microsoft/fluid-server-services-core";
import { EventEmitter } from "events";

// tslint:disable-next-line: completed-docs
export class TestReservationManager extends EventEmitter implements IReservationManager {
    constructor(
        private nodeFactory: IConcreteNodeFactory,
        private mongoManager: MongoManager,
        private reservationColletionName: string) {
        super();
    }

    public async getOrReserve(key: string, node: IConcreteNode): Promise<IConcreteNode> {
        const reservations = await this.getReservationsCollection();
        const reservation = await reservations.findOne({ _id: key });

        // Reservation can be null (first time), expired, or existing and within the time window
        if (reservation === null) {
            await this.makeReservation(node, key, null, reservations);
            return node;
        } else {
            const remoteNode = await this.nodeFactory.create();
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
        existing: IReservation,
        collection: ICollection<IReservation>): Promise<any> {

        const newReservation: IReservation = { _id: key, node: node.id };

        if (existing) {
            await collection.update(
                { _id: key, node: existing.node },
                newReservation,
                null);
        } else {
            await collection.insertOne(newReservation);
        }
    }

    private async getReservationsCollection(): Promise<ICollection<IReservation>> {
        const db = await this.mongoManager.getDatabase();
        return db.collection<IReservation>(this.reservationColletionName);
    }
}
