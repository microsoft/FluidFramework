import * as connection from './connection';
import { Promise } from 'es6-promise';

const collectionName = 'documents'

var collection = connection.getOrCreateCollection(collectionName);

export function read(id: string): Promise<any> {
    return collection.read(id);
}