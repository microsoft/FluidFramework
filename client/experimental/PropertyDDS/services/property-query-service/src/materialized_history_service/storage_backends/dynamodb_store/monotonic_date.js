/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * This monotonic date implementation ensures that date instances created within the same process
 * never jump back in time as a result of clock drift or adjustment. The {@link TopologySortKey}
 * makes use of both the MonotonicDate and {@link MonotonicCounter} to generate unique dates that:
 * 1) never jump back in time
 * 2) are unique
 * This is a requirement for the DynamoDBStore to guarantee commit ordering within the
 * 'commits.byTopology2' global secondary index.
 */
class MonotonicDate {
  /**
   * Creates a new MonotonicDate.
   */
  constructor() {
    this._lastTime = new Date().getTime();
  }

  /**
   * @return {Date} A Date instance that is guaranteed to never jump back in time. It can however
   *   stay the same for a period of time equal to a clock adjustment in the past. For example,
   *   setting the clock back 2 minutes will cause this function to return the same date for 2
   *   minutes. That's why applications that require unique, monotonic clocks
   *   {@link TopologySortKey} combine the result of this call with a monotonic counter.
   */
  now() {
    const now = new Date();
    const nowTime = now.getTime();
    if (nowTime > this._lastTime) {
      this._lastTime = nowTime;
      return now;
    }

    // The clock didn't increase. Worse, it may have jumped back in time.
    // Return the previous date.
    return new Date(this._lastTime);
  }
}

const instance = new MonotonicDate();

module.exports = instance;
