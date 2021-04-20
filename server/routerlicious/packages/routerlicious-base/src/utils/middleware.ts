/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErrorRequestHandler, RequestHandler } from "express";
import safeStringify from "json-stringify-safe";

export const catch404: () => RequestHandler = () => (req, res, next) => {
    const err = new Error("Not Found");
    (err as any).status = 404;
    next(err);
};

export const handleError: (showStackTrace?: boolean) => ErrorRequestHandler =
    (showStackTrace = true) => (err, req, res, next) => {
        res.status(err?.status || 500);
        res.json({ error: showStackTrace ? safeStringify(err) : "", message: err?.message });
    };
