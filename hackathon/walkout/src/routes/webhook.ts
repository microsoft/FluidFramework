import { Router } from "express";
import { IHook, IPingHook, IPushHook } from "../github";
import { AppendManager } from "../services";

export function create(appendManager: AppendManager): Router {
    const router: Router = Router();

    router.post("/payload", (request, response) => {
        const event = request.headers["x-github-event"] as string;
        const hook = request.body as IHook;
        appendManager.append(event, hook);

        switch (event) {
            case "push":
                const pushHook = hook as IPushHook;
                console.log(pushHook.repository.full_name);
                console.log(pushHook.base_ref);
                console.log(JSON.stringify(pushHook.pusher, null, 2));
                break;

            case "ping":
                const pingHook = hook as IPingHook;
                console.log(pingHook.zen);
                console.log(pingHook.hook_id);
                console.log(JSON.stringify(pingHook.hook, null, 2));
                break;
        }

        response.status(200).end();
    });

    return router;
}
