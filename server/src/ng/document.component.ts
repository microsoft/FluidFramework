import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { InteractiveDocumentViewService } from './interactive-document-view.service';
import { InteractiveDocumentService } from './interactive-document.service';
import { ViewModel, IViews, IView, Resource } from '../interfaces';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
    selector: 'interactive-document',
    templateUrl: 'templates/document.component.html',
    providers: [InteractiveDocumentService, InteractiveDocumentViewService]
})
export class DocumentComponent {
    // The loaded document    
    document: ViewModel;

    // The available views for that document
    views: IViews;

    // The view we'll choose to load
    view: IView;
    viewUrl: SafeUrl;

    // Loading flag for the document
    loading: boolean = false;
    loaded: boolean = false;
    error: boolean = false;

    constructor(
        private documentService: InteractiveDocumentService, 
        private viewService: InteractiveDocumentViewService,
        private sanitizer: DomSanitizer) {
    }

    load(url: string): void {
        this.loading = true;

        let loadedP = this.documentService.getDocument(url).then((document) => {
            this.document = document;

            // see if we have views for the given document
            return this.viewService.getViews(this.document._type).then((views) => {
                this.views = views;

                // Select the 0th view
                let items = this.views._embedded["item"] as Resource[];
                this.view = items.length > 0 ? items[0] as IView : null;
                this.viewUrl = this.view ? this.sanitizer.bypassSecurityTrustResourceUrl(this.view.url) : null;                
            });
        });

        // clean up after the document load         
        loadedP.then(
            () => {
                this.loading = false;
                this.loaded = true;                
            }, 
            (error) => {
                this.loading = false;
                this.error = true;
            });
    }
}