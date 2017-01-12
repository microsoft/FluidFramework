import * as express from 'express';
import * as views from '../db/views';
import { Promise } from 'es6-promise';
import { defaultPartials } from './partials';
import { IView, IViews, Link } from '../interfaces';

var router = express.Router();

class View implements IView {
    constructor(public type: string, public url: string) {
    }
}

class Views implements IViews {
    _links: { [rel: string]: Link | Link[] };
    _embedded: { [rel: string]: View[] };

    constructor(self: string, views: View[]) {
        this._links = { "self": { href: self } };
        this._embedded = { "item": views };
    }
}

/**
 * Retrieves a list of all supported views in the system
 */
router.get('/', (req: express.Request, response: express.Response) => {
    let type = req.query['type'];

    let viewsP: Promise<View[]> = type ? views.search(type) : views.getAll();

    viewsP.then(
        (views) => {
            let result = new Views(req.originalUrl, views);
            return response.json(result);
        },
        (error) => {
            return response.status(400).json(error);
        })
});

export = router;