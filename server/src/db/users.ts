import * as connection from './connection';
import * as uuid from 'node-uuid';
import { Promise } from 'es6-promise';

const collectionName = 'users'

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
    var id = uuid.v4();
    var userDocument: IUser = {
        id: id,
        details: details
    };

    return collection.create(userDocument);
}