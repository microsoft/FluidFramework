import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';

import { AppComponent } from './app.component';
import { DocumentComponent } from './document.component';

@NgModule({
    imports: [
        BrowserModule, 
        FormsModule,
        HttpModule
    ],
    declarations: [
        AppComponent,
        DocumentComponent
    ],
    bootstrap: [AppComponent]
})

export class AppModule {
}