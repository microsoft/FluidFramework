import * as api from "../api-core";

/**
 * Collaborative cell interface
 */
export interface ICell extends api.ICollaborativeObject {
    /**
     * Retrieves the cell value.
     */
    get(): Promise<any>;

    /**
     * Sets the cell value.
     */
    set(value: any): Promise<void>;

    /**
     * Checks whether cell is empty or not.
     */
    empty(): Promise<boolean>;

    /**
     * Delete the value from the cell.
     */
    delete(): Promise<void>;
}
