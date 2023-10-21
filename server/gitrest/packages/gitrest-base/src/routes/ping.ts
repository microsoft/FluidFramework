import { Router } from "express";

export function create() {
    const router = Router();

    router.get('/api/v1/ping', (req, res) => {
        res.status(200).send('ok');
    });

    return router;
}
