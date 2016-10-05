import { Component, Input, OnChanges, SimpleChanges, ElementRef, AfterViewInit } from '@angular/core';
import { InteractiveDocumentViewService } from './interactive-document-view.service';
import { InteractiveDocumentService } from './interactive-document.service';
import { ViewModel, IViews, IView, Resource } from '../interfaces';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { InteractiveDocumentHost } from '../api/index';

@Component({
    selector: 'interactive-document-frame',
    templateUrl: 'templates/interactive-document-frame.component.html',
    providers: [InteractiveDocumentService, InteractiveDocumentViewService]
})
export class InteractiveDocumentFrameComponent implements AfterViewInit {
    @Input()
    document: ViewModel;

    @Input()
    view: IView;

    private _interactiveDocumentHost: InteractiveDocumentHost;

    constructor(private elementRef: ElementRef) {
    }

    ngAfterViewInit() {
        // Get the iframe and begin the connection
        let iframe = this.elementRef.nativeElement.querySelector('iframe');
        this._interactiveDocumentHost = new InteractiveDocumentHost(window, iframe.contentWindow);
        this._interactiveDocumentHost.connect();

        // Load in the view
        iframe.setAttribute('src', this.view.url);

        // Pass the view model to the view
        this._interactiveDocumentHost.send(this.document);
    }
}