import { Component, Input, OnChanges, SimpleChanges, ElementRef, AfterViewInit } from '@angular/core';
import { InteractiveDocumentViewService } from './interactive-document-view.service';
import { InteractiveDocumentService } from './interactive-document.service';
import { ViewModel, IViews, IView, Resource } from '../interfaces';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
    selector: 'interactive-document-frame',
    templateUrl: 'templates/interactive-document-frame.component.html',
    providers: [InteractiveDocumentService, InteractiveDocumentViewService]
})
export class InteractiveDocumentFrameComponent implements AfterViewInit {
    @Input()
    url: string;

    constructor(private elementRef: ElementRef, private sanitizer: DomSanitizer) {
    }

    ngAfterViewInit() {
        // Load in the bound view                
        let iframe = this.elementRef.nativeElement.querySelector('iframe');
        iframe.setAttribute('src', this.url);
    }
}