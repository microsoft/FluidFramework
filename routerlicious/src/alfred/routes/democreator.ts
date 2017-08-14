import { Router } from "express";
import { defaultPartials } from "./partials";

import * as moniker from "moniker";

const router: Router = Router();

/**
 * Loading the demo creator page.
 */
router.get("/:id?", (request, response, next) => {
    const id = request.params.id ? request.params.id : "test";

    const currentDate = new Date().toJSON().slice(0, 10).replace(/-/g, "-");

    // Generate monikers for offnet original OT links.
    const nocomposeMoniker = currentDate + "-" + moniker.choose() + "?nocompose";
    const composeMoniker   = currentDate + "-" + moniker.choose();

    /**
     * Generate monikers for Prague demos. Note that beginning with a single
     * slash will cause Hogan/HTML to automatically fill-in the root of the
     * URL (and use these monikers as relative paths)!
     */
    const mapsMoniker = "/maps/" + currentDate + "-" + moniker.choose();
    const cellMoniker = "/cell/" + currentDate + "-" + moniker.choose();
    const canvasMoniker = "/canvas/" + currentDate + "-" + moniker.choose();
    const sharedTextMoniker = "/sharedText/" + currentDate + "-" + moniker.choose();
    const scribeMoniker = "/scribe/";

    response.render(
        "democreator",
        {
            id,
            partials: defaultPartials,
            title: id,

            nocomposeMoniker,
            composeMoniker,

            mapsMoniker,
            cellMoniker,
            canvasMoniker,
            sharedTextMoniker,
            scribeMoniker,
        });
});

export default router;
