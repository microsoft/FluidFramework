/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function getRelativeDate(timestamp: Date): string {
  // https://stackoverflow.com/questions/7641791/javascript-library-for-human-friendly-relative-date-formatting
  var delta = Math.round(((new Date).getTime() - new Date(timestamp).getTime()) / 1000);

  var minute = 60,
    hour = minute * 60,
    day = hour * 24;

  if (delta < 30) {
    return 'just now';
  } else if (delta < 3 * minute) {
    return 'a few minutes ago';
  } else if (delta < hour) {
    return Math.floor(delta / minute) + ' minutes ago';
  } else if (Math.floor(delta / hour) < 3) {
    return 'a few hours ago.'
  } else if (delta < day) {
    return Math.floor(delta / hour) + ' hours ago';
  } else if (delta < day * 2) {
    return 'yesterday';
  } else {
    return timestamp.toUTCString();
  }
}