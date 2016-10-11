import { Component, Input, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import { InteractiveDocumentViewService } from './interactive-document-view.service';
import { InteractiveDocumentService } from './interactive-document.service';
import { ViewModel, IViews, IView, Resource } from '../interfaces';
import { PostMessageHostServer } from '../api/index';

@Component({
    selector: 'interactive-document',
    templateUrl: 'templates/document.component.html',
    providers: [InteractiveDocumentService, InteractiveDocumentViewService]
})
export class DocumentComponent implements OnInit {    
    // Loading flag for the document    
    loaded: boolean = false;

    url: string;

    // The hosting server - this should probably be a shared angular service but keeping simple for now
    private _server = new PostMessageHostServer(window);

    constructor(
        private documentService: InteractiveDocumentService,
        private viewService: InteractiveDocumentViewService) {
    }

    ngOnInit() {
        this._server.start();        
    }

    load(url: string): void {
        this.url = url;
        this.loaded = true;
    }
}