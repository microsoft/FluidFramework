/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErrorRequestHandler, RequestHandler } from "express";
import safeStringify from "json-stringify-safe";

export const catch404: () => RequestHandler = () => (req, res, next) => {
    const err = new Error("Not Found");
    (err as any).status = 404;
    next(err);
};

export const handleError: () => ErrorRequestHandler = () => (err, req, res, next) => {
    res.status(err?.status || 500);
    res.json({ error: safeStringify(err), message: err?.message });
};
