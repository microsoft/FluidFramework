import { Promise } from "es6-promise";
import * as connection from "./connection";

const collectionName = "documents";

let collection = connection.getOrCreateCollection(collectionName);

export function read(id: string): Promise<any> {
    return collection.read(id);
}
