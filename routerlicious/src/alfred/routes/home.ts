import { Router } from "express";
import { defaultPartials } from "./partials";

const router: Router = Router();

/**
 * Route to retrieve the home page for the app
 */
router.get("/", (request, response, next) => {
    response.render("home", { partials: defaultPartials, title: "Routerlicious" });
});

export default router;
