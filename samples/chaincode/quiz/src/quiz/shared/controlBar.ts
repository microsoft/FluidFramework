/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ko from "knockout";

export type IControlButtonHandler = ()  => void;

export class ControlButton {
    public title: KnockoutObservable<string>;
    public enabled: KnockoutComputed<boolean>;
    public visible: KnockoutComputed<boolean>;

    private clickHandler: IControlButtonHandler;

    constructor(
        title: string,
        clickHandler: IControlButtonHandler,
        enabledCallback: () => boolean, visibleCallback?: () => boolean) {
        this.title = ko.observable(title);

        if (enabledCallback) {
            this.enabled = ko.computed(() => {
                return enabledCallback();
            });
        } else {
            // default enabled always return true
            this.enabled = ko.computed(() => true);
        }

        if (visibleCallback) {
            this.visible = ko.computed(() => {
                return visibleCallback();
            });
        } else {
            // default enabled always return true
            this.visible = ko.computed(() => this.enabled());
        }

        this.clickHandler = clickHandler;

    }

    public click() {
        this.clickHandler();
    }
}

export class ControlBarViewModel {
    public title: KnockoutObservable<string>;
    public leftButtons: KnockoutObservableArray<ControlButton>;
    public rightButtons: KnockoutObservableArray<ControlButton>;

    constructor() {
        this.title = ko.observable("Control Bar");
        this.leftButtons = ko.observableArray([]);
        this.rightButtons = ko.observableArray([]);
    }
}
