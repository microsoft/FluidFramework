/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as uuid from "uuid";
import { Request, Response, NextFunction } from "express";

const asyncLocalStorage = new AsyncLocalStorage();

export function getCorrelationId(): string | undefined {
    const id = asyncLocalStorage.getStore();
    return typeof(id) === "string" ? id : undefined;
}

export function bindCorrelationId(headerName: string = "x-correlation-id"):
    (req: Request, res: Response, next: NextFunction) => void {
    const randId = uuid.v4();
    return (req, res, next) => {
        const id: string = req.header(headerName) || randId;
        res.setHeader(headerName, id);
        asyncLocalStorage.run(id, () => next());
    };
}
