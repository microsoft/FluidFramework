import { MongoManager } from "../../utils";

export interface IReservationManager {
    /**
     * Attempts to create a reservation for the given ID. Returns the id that currently holds the reservation.
     * This will be the same as the provided id if the reservation is granted.
     */
    reserve(id: string): Promise<string>;
}

export class ReservationManager implements IReservationManager {
    constructor(mongoManager: MongoManager) {
        //
    }

    public async reserve(id: string): Promise<string> {
        return;
    }
}
