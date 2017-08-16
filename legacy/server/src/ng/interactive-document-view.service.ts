import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import * as querystring from "querystring";
import "rxjs/add/operator/toPromise";
import { IViews } from "../interfaces";

@Injectable()
export class InteractiveDocumentViewService {
    constructor(private http: Http) {
    }

    /**
     * Retrieves the views resource for the given type
     */
    public getViews(type: string): Promise<IViews> {
        let query = querystring.stringify({ type });
        return this.http.get(`/views?${query}`).toPromise().then((response) => (<IViews> response.json()));
    }
}
