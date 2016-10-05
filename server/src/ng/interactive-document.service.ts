import { Injectable } from '@angular/core';
import { ViewModel } from '../interfaces';
import { Http } from '@angular/http';
import 'rxjs/add/operator/toPromise';

@Injectable()
export class InteractiveDocumentService {
    constructor(private http: Http) {        
    }

    getDocument(url: string): Promise<ViewModel> {        
        return this.http.get(url).toPromise().then((response) => response.json());        
    }
}