import { Promise } from "es6-promise";
import * as express from "express";
import * as views from "../db/views";
import { ILink, IView, IViews } from "../interfaces";
import { defaultPartials } from "./partials";

let router = express.Router();

// TODO split into multiple files
// tslint:disable:max-classes-per-file

class View implements IView {
    constructor(public type: string, public url: string) {
    }
}

class Views implements IViews {
    // tslint:disable:variable-name:JSON format contains _
    public _links: { [rel: string]: ILink | ILink[] };
    public _embedded: { [rel: string]: View[] };
    // tslint:enable:variable-name

    constructor(self: string, views: View[]) {
        this._links = { self: { href: self } };
        this._embedded = { item: views };
    }
}

/**
 * Retrieves a list of all supported views in the system
 */
router.get("/", (req: express.Request, response: express.Response) => {
    // tslint:disable-next-line:no-string-literal
    let type = req.query["type"];

    let viewsP: Promise<View[]> = type ? views.search(type) : views.getAll();

    viewsP.then(
        (views) => {
            let result = new Views(req.originalUrl, views);
            return response.json(result);
        },
        (error) => {
            return response.status(400).json(error);
        });
});

export = router;
