/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* tslint:disable */
import * as ko from "knockout";

// For Localization
declare var Localization;
declare var CKEDITOR;

// filter out unnecessary keys (like enter)
export function filterKeys(data, event): boolean {
    return event.keyCode !== 13;
}

// set focusOnDisplay binding to ko
export function addFocusOnInitBinding() {
    ko.bindingHandlers["focusOnInit"] = {
        init: (element, valueAccessor, allBindings, viewModel, bindingContext) => {
            const e = $(element);
            const controlBarHeight = $("#quiz-controls-container").outerHeight();
            const heightToScroll = e.offset().top + e.outerHeight() - ($(window).scrollTop() +
                $(window).height() - controlBarHeight) + 5;
            if (heightToScroll > 0) {
                window.scrollBy(0, heightToScroll);
            }
        },
    };
}

export function addScrollToBottomOnInitBinding() {
    ko.bindingHandlers["scrollToBottomOnInit"] = {
        init: (element, valueAccessor, allBindings, viewModel, bindingContext) => {
            window.scrollTo(0, $(document).height());
        },
    };
}

export function addFadeBinding() {
    ko.bindingHandlers["fade"] = {
        init: (element, valueAccessor, allBindings, viewModel, bindingContext) => {
            $(element).hide();
        },
        update: (element, valueAccessor, allBindings, viewModel, bindingContext) => {
            setTimeout(() => {
                $(element).hide({
                    done: () => $(element).fadeIn(),
                    duration: 0,
                });
            });
        },
    };
}

export function addMinNumberExtender() {
    ko.extenders["minNumber"] = (target: KnockoutObservable<number>, minNumber: number) => {
        const result = ko.computed({
            read: target,
            write: (newValue: any) => {
                let intValue: number;
                if (typeof(newValue) === "string") {
                    intValue = Math.floor(parseInt(newValue, 10));
                    intValue = isNaN(intValue) ? minNumber : intValue;
                } else if (typeof(newValue) === "number") {
                    intValue = Math.floor(newValue);
                } else {
                    throw new Error("unexpected data type in MinNumberExtender: " + newValue);
                }

                if (intValue < minNumber) {
                    intValue = minNumber;
                }
                target(intValue);
                target.notifySubscribers(intValue);
            },
        }).extend({notify: "always"});

        result(target());
        return result;
    };
}

// This is a filter to only use the languages we are localizing for since CKEditor has support for a lot
// of other languages.
export function filterLanguage(input: string): string {
    if ((input === "es-ES") || (input === "de-DE") || (input === "fr-FR") || (input === "ja-JP")) {
        return input;
    } else {
        return "en-US";
    }
}

export function addContentEditableBindings() {
    // Knockout binding for contenteditables. This is a two way binding that works for
    // both CKEdit inlined element and normal element.
    ko.bindingHandlers["htmlValue"] = {
        init: (element, valueAccessor, allBindingsAccessor) => {
            // Trigger the binding on any occurence of 'focus', 'blur', or 'keyup'.
            ko.utils.registerEventHandler(element, "keyup focus blur", () => {
                const modelValue = valueAccessor();
                const ckInstance = CKEDITOR.instances[element.id];
                // If this element is CKEdit inlined, use the getData() method.
                if (ckInstance) {
                    const elementValue = ckInstance.getData();
                    // Handle two way binding.
                    if (ko.isWriteableObservable(modelValue)) {
                        modelValue(elementValue);
                    } else { // Handle non-observable one-way binding.
                        const allBindings = allBindingsAccessor();
                        if (allBindings["_ko_property_writers"] && allBindings["_ko_property_writers"].htmlValue) {
                            allBindings["_ko_property_writers"].htmlValue(elementValue);
                        }
                    }
                } else { // Otherwise just use the innerHTML value
                    if (ko.isWriteableObservable(modelValue)) {
                        modelValue(element.innerHTML);
                    } else {
                        const allBindings = allBindingsAccessor();
                        if (allBindings["_ko_property_writers"] && allBindings["_ko_property_writers"].htmlValue) {
                            allBindings["_ko_property_writers"].htmlValue(element.innerHTML);
                        }
                    }
                }
            });
        },
        // Only update when the element value has changed.
        update: (element, valueAccessor) => {
            const value = ko.utils.unwrapObservable(valueAccessor()) || "";
            const ckInstance = CKEDITOR.instances[element.id];
            if (ckInstance) {
                if (ckInstance.getData() !== value) {
                    ckInstance.setData(value);
                }
            } else {
                if (element.innerHTML !== value) {
                    element.innerHTML = value;
                }
            }
        },
    };

    // Knockout binding for attaching CKEditor.
    ko.bindingHandlers["ckEditInliner"] = {
        // Only attach it once during initialization.
        init: (element, valueAccessor) => {
            CKEDITOR.config.language = "en-us";
            CKEDITOR.disableAutoInline = true;
            CKEDITOR.inline(element.id, {
                extraPlugins: "mathequation",
                removePlugins: "about",
            });
            const modelValue = valueAccessor();
            // For now, this means that a new option is created. So we can just hard code the default value.
            if (!modelValue()) {
                modelValue("<p>Insert option here</p>");
            }
        },
    };
}

export function addLocalizationBindings() {
    const texts = Localization.getLocaleStrings("en-US");
    ko.bindingHandlers["localText"] = {
        update: (element, valueAccessor, allBindingsAccessor, viewModel, context) => {
            const key = ko.utils.unwrapObservable(valueAccessor());
            ko.bindingHandlers.text.update(
                element,
                () => texts[key] || "",
                allBindingsAccessor,
                viewModel,
                context);
        },
    };

    /*
    TODO: add binding back!
    ko.bindingHandlers["localTooltip"] = {
        update: (element, valueAccessor, allBindingsAccessor, viewModel, context) => {
            const value = ko.utils.unwrapObservable(valueAccessor());
            value.title = texts[value.title] || value.title || "";
            $(element).tooltip(value);
        },
    };
    */

    ko.bindingHandlers["localLink"] = {
        update: (element, valueAccessor, allBindingsAccessor, viewModel, context) => {
            const key = ko.utils.unwrapObservable(valueAccessor());
            const attrObj = {};
            attrObj["href"] = texts[key] || "";
            ko.bindingHandlers.attr.update(
                element,
                () => attrObj,
                allBindingsAccessor,
                viewModel,
                context);
        },
    };
}

export function addCustomBindings() {
    addFocusOnInitBinding();
    addScrollToBottomOnInitBinding();
    addFadeBinding();
    addMinNumberExtender();
    addContentEditableBindings();
    addLocalizationBindings();
}
