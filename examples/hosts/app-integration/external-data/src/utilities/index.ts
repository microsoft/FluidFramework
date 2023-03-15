/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { MockWebhook, SubscriberUrl } from "./webhook";
export { fluidServicePort } from "./fluidService";

/**
 * Represents the external data servers query url or uuid.
 * This is the URL or the id of the external resource that the customer service needs to subscribe for at the external service.
 */
export type ExternalTaskListId = string;
