import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Http } from '@angular/http';
import 'rxjs/add/operator/toPromise';

@Component({
    selector: 'interactive-document',
    templateUrl: 'templates/document.component.html'
})
export class DocumentComponent {
    // TODO make this a base class of our view model type
    document: any;

    constructor(private http: Http) {
    }

    load(url: string): void {
        // go and fetch the document to start loading it into the container
        let result = this.http.get(url).toPromise();
        result.then(
            (response) => {
                this.document = response.json();
            },
            (error) => {
                console.log(error);
            });
    }
}