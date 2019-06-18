/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges } from "@angular/core";
import { DomSanitizer, SafeUrl } from "@angular/platform-browser";
import { IResource, IView, IViewModel, IViews } from "../interfaces";
import { InteractiveDocumentViewService } from "./interactive-document-view.service";
import { InteractiveDocumentService } from "./interactive-document.service";

@Component({
    providers: [InteractiveDocumentService, InteractiveDocumentViewService],
    selector: "interactive-document-frame",
    templateUrl: "templates/interactive-document-frame.component.html",
})
export class InteractiveDocumentFrameComponent implements AfterViewInit {
    @Input()
    public url: string;

    constructor(private elementRef: ElementRef, private sanitizer: DomSanitizer) {
    }

    public ngAfterViewInit() {
        // Load in the bound view
        let iframe = this.elementRef.nativeElement.querySelector("iframe");
        iframe.setAttribute("src", this.url);
    }
}
