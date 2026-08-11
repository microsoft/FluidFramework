/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Attendee, AttendeeId } from "@fluid-internal/presence-definitions";

/**
 * Utility type limiting to a specific attendee. (An attendee with
 * a specific session ID - not just any session ID.)
 */
export type SpecificAttendee<SpecificAttendeeId extends AttendeeId> =
	string extends SpecificAttendeeId ? never : Attendee<SpecificAttendeeId>;
