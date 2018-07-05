import { ICollection } from "../../core";
import { MongoManager } from "../../utils";
import { debug } from "../debug";

export interface IReservation {
    key: string;
    value: string;
    expiration: number;
}

export interface IReservationManager {
    /**
     * Attempts to make a reservation at the given key with the provided value. The return result will either
     * be the requested reservation. Or the value that currently holds the reservation.
     */
    reserve(key: string, value: string, expiration: number): Promise<IReservation>;

    /**
     * Attempts to update the given reservation to the new expiration time.
     */
    update(reservation: IReservation, expiration: number): Promise<IReservation>;
}

export class ReservationManager implements IReservationManager {
    constructor(private mongoManager: MongoManager, private collectionName: string) {
    }

    public async reserve(key: string, value: string, expiration: number): Promise<IReservation> {
        const reservations = await this.getReservationsCollection();

        // First get any existing value
        const reservation = await reservations.findOne({ key });

        // Reservation can be null (first time), expired, or existing and within the time window
        const now = Date.now();
        if (reservation === null || now > reservation.expiration) {
            const newReservation = {
                expiration,
                key,
                value,
            };
            debug("Attempting to reserve", reservation, newReservation);
            return this.makeReservation(reservation, newReservation, reservations);
        } else {
            debug("Using existing reservation", reservation);
            return reservation;
        }
    }

    public async update(reservation: IReservation, expiration: number): Promise<IReservation> {
        const newReservation = {
            expiration,
            key: reservation.key,
            value: reservation.value,
        };

        const reservations = await this.getReservationsCollection();
        await reservations.update(reservation, newReservation, null);

        return newReservation;
    }

    private async makeReservation(
        existing: IReservation,
        requested: IReservation,
        collection: ICollection<IReservation>): Promise<IReservation> {

        if (existing) {
            await collection.update(
                {
                    expiration: existing.expiration,
                    key: existing.key,
                    value: existing.value,
                },
                requested
                ,
                null);
        } else {
            await collection.insertOne(requested);
        }

        return requested;
    }

    private async getReservationsCollection(): Promise<ICollection<IReservation>> {
        const db = await this.mongoManager.getDatabase();
        return db.collection<IReservation>(this.collectionName);
    }
}
