import * as connection from './connection';
import { Promise } from 'es6-promise';
import * as _ from 'lodash';
import * as moment from 'moment';

const collectionName = 'deltas'

var collection = connection.getOrCreateCollection(collectionName);

export function append(id: string, deltas: any[]): Promise<any> {    
    let now = moment.now();
    return collection.create({ document: id, deltas: deltas, ts: now, }, false);
}

export function get(id: string): Promise<any> {
    let opsP = collection.query("SELECT * FROM deltas WHERE deltas.document=@id ORDER BY deltas.ts", [{ name: "@id", value: id }]);
    return opsP;
}