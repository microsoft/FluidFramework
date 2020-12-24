/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as uuid from "uuid";
import { Request, Response, NextFunction } from "express";

const asyncLocalStorage = new AsyncLocalStorage<string>();

export function getCorrelationId(): string | undefined {
    const id = asyncLocalStorage.getStore();
    return id;
}

export const bindCorrelationId = (headerName: string = "x-correlation-id") =>
    ((req: Request, res: Response, next: NextFunction): void => {
        const id: string = req.header(headerName) || uuid.v4();
        res.setHeader(headerName, id);
        asyncLocalStorage.run(id, () => next());
    })
