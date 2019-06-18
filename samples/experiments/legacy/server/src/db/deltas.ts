/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Promise } from "es6-promise";
import * as _ from "lodash";
import * as moment from "moment";
import * as connection from "./connection";

const collectionName = "deltas";

let collection = connection.getOrCreateCollection(collectionName);

export function append(id: string, deltas: any[]): Promise<any> {
    let now = moment.now();
    return collection.create({ document: id, deltas, ts: now }, false);
}

export function get(id: string): Promise<any> {
    let opsP = collection.query(
        "SELECT * FROM deltas WHERE deltas.document=@id ORDER BY deltas.ts",
        [{ name: "@id", value: id }]);
    return opsP;
}
