import { Router } from "express";
import * as passport from "passport";

export function create(): Router {
    const router: Router = Router();

    router.get(
        "/login",
        passport.authenticate("github", { scope: ["repo"] }));

    router.get(
        "/auth/github/callback",
        passport.authenticate("github", {
            failureRedirect: "/login",
            successReturnToOrRedirect: "/",
        },
    ));

    return router;
}
