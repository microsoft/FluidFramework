import { Promise } from "es6-promise";
import * as uuid from "node-uuid";
import * as connection from "./connection";

const collectionName = "users";

let collection = connection.getOrCreateCollection(collectionName);

/**
 * Details about a given user
 */
export interface IUserDetails {
    displayName: string;
    name: {
        familyName: string;
        givenName: string;
    };
}

/**
 * User interface
 */
export interface IUser {
    id: string;
    details: IUserDetails;
}

export function getUser(id: string): Promise<any> {
    return collection.read(id);
}

export function putUser(details: IUserDetails): Promise<any> {
    let id = uuid.v4();
    let userDocument: IUser = {
        details,
        id,
    };

    return collection.create(userDocument);
}
