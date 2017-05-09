import * as express from "express";

const router = express.Router();

const defaultPartials = {
    layout: "layout",
};

/**
 * Route to retrieve the home page for the app
 */
router.get("/", (request, response, next) => {
    response.render("home", { partials: defaultPartials, title: "Routerlicious" });
});

/**
 * Allow loading of a specific document
 */
router.get("/maps/:id?", (request, response, next) => {
    const id = request.params.id ? request.params.id : "test";
    renderDocument(id, response);
});

function renderDocument(id: string, response: express.Response) {
    response.render(
        "document",
        {
            id,
            partials: defaultPartials,
            title: id,
        });
}

export default router;
