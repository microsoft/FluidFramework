/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	SeaDirectoryEntries,
	SeaDurability,
	SeaErrorKind,
	SeaEventReceipt,
	SeaInjectedClient,
	SeaLoadKind,
	SeaLoadResult,
	SeaServiceError,
	SeaTreeId,
	SeaTreeKind,
} from "../../../../crates/sea-webtransport/pkg/web/sea_webtransport.js";

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;
type Assert<Value extends true> = Value;
type EventResult = Extract<SeaLoadResult, { readonly kind: SeaLoadKind.Event }>;

/** Compile fixture proving event positions are required after load-result narrowing. */
export type EventPositionIsRequired = Assert<Equal<EventResult["position"], bigint>>;
/** Compile fixture proving event payloads are required after load-result narrowing. */
export type EventPayloadIsRequired = Assert<Equal<EventResult["payload"], Uint8Array>>;
/** Compile fixture proving directory reads return named generated entries. */
export type DirectoryEntriesAreTyped = Assert<
	Equal<Awaited<ReturnType<SeaInjectedClient["getDirectory"]>>, SeaDirectoryEntries>
>;
/** Compile fixture proving event durability uses a closed generated enum. */
export type DurabilityIsClosed = Assert<Equal<SeaEventReceipt["durability"], SeaDurability>>;
/** Compile fixture proving tree identity kind uses a closed generated enum. */
export type TreeKindIsClosed = Assert<Equal<SeaTreeId["kind"], SeaTreeKind>>;
/** Compile fixture proving service errors preserve their closed category. */
export type ServiceErrorKindIsClosed = Assert<Equal<SeaServiceError["kind"], SeaErrorKind>>;
