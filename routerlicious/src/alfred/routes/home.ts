import * as express from "express";

const router = express.Router();

const defaultPartials = {
    layout: "layout",
};

/**
 * Route to retrieve the home page for the app
 */
router.get("/", (request, response, next) => {
    renderDocument("test", response);
});

/**
 * Allow loading of a specific document
 */
router.get("/:id", (request, response, next) => {
    renderDocument(request.params.id, response);
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
