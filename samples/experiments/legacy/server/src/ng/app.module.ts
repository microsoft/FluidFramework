/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpModule } from "@angular/http";
import { BrowserModule } from "@angular/platform-browser";
import { Angular2DataTableModule } from "angular2-data-table";
import { AppComponent } from "./app.component";
import { DocumentComponent } from "./document.component";
import { InteractiveDocumentFrameComponent } from "./interactive-document-frame.component";

@NgModule({
    bootstrap: [AppComponent],
    declarations: [
        AppComponent,
        DocumentComponent,
        InteractiveDocumentFrameComponent,
    ],
    imports: [
        BrowserModule,
        FormsModule,
        HttpModule,
        Angular2DataTableModule,
    ],
})

export class AppModule {
}
