import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import "rxjs/add/operator/toPromise";
import { IViewModel } from "../interfaces";

@Injectable()
export class InteractiveDocumentService {
    constructor(private http: Http) {
    }

    public getDocument(url: string): Promise<IViewModel> {
        return this.http.get(url).toPromise().then((response) => response.json());
    }
}
