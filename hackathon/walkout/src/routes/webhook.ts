import { Router } from "express";
import { IPingHook, IPushHook } from "../github";

export function create(): Router {
    const router: Router = Router();

    router.post("/payload", (request, response) => {
        const event = request.headers["x-github-event"];
        switch (event) {
            case "push":
                const pushHook = request.body as IPushHook;
                console.log(pushHook.repository.full_name);
                console.log(pushHook.base_ref);
                console.log(JSON.stringify(pushHook.pusher, null, 2));
                break;

            case "ping":
                const pingHook = request.body as IPingHook;
                console.log(pingHook.zen);
                console.log(pingHook.hook_id);
                console.log(JSON.stringify(pingHook.hook, null, 2));
                break;
        }

        response.status(200).end();
    });

    return router;
}
