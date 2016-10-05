import { Injectable } from '@angular/core';
import { IViews } from '../interfaces';
import { Http } from '@angular/http';
import * as querystring from 'querystring';
import 'rxjs/add/operator/toPromise';

@Injectable()
export class InteractiveDocumentViewService {
    constructor(private http: Http) {
    }

    /**
     * Retrieves the views resource for the given type
     */
    getViews(type: string): Promise<IViews> {
        let query = querystring.stringify({ type: type });
        return this.http.get(`/views?${query}`).toPromise().then((response) => (<IViews>response.json()));
    }
}