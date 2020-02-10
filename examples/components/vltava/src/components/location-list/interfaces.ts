/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IListViewDataModel {
    items: string[];
    on(event: "itemChanged", listener: () => void): this;
}
