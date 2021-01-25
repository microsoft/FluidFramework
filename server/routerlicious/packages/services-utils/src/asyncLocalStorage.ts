/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as uuid from "uuid";
import { Request, Response, NextFunction } from "express";

const asyncLocalStorage = new AsyncLocalStorage<string>();

export function getCorrelationId(als?: AsyncLocalStorage<string>): string | undefined {
    if (als) {
        return als.getStore();
    } else {
        return asyncLocalStorage.getStore();
    }
}

export const bindCorrelationId = (als?: AsyncLocalStorage<string>, headerName: string = "x-correlation-id") =>
    ((req: Request, res: Response, next: NextFunction): void => {
        const id: string = req.header(headerName) || uuid.v4();
        res.setHeader(headerName, id);
        if (als) {
            als.run(id, () => next());
        } else {
            asyncLocalStorage.run(id, () => next());
        }
    });
