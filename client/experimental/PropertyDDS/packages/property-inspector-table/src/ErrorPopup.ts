/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { notificationContext } from "./NotificationsViewer";

const isPromise = <K, R>(in_obj: Promise<K> | R): in_obj is Promise<K> => {
  return Promise.resolve(in_obj as Promise<K>) === in_obj;
};

/**
 * Extracts the error message and pushes to the notification list in the context
 */
export const CreateErrorObjAndSend = (err: string | Error) => {
  const errObj = {
    message: (typeof err === "string" ? err : err.message),
  };
  notificationContext.pushNotification(errObj);
};

/**
 * Print the error, push into notification context and throw again if needed
 */
const processError = (err: string | Error) => {
  console.log(err);
  CreateErrorObjAndSend(err);
};

type anyFunction = (...args: any[]) => any;
/**
 * Catches errors from a rejected promise or from a throwing function and pushes it into a notification list.
 * If no error occurs, returns according to the input function.
 * @param anythingThatMightEmitError - The input function. Parameters should be passed by using `bind`.
 * @param catchErr - (default = true) Whether to catch errors or not. If this is false, the ErrorPopup will return a
 * rejected Promise on error.
 * @return A Promise. When the given function returns a Promise, this Promise is returned in case of
 * `catchErr = false`. If it set to `true`, a caught Promise is returned. When the given function returns anything but
 * a Promise, a Promise that resolves with the function's return value is returned.
 * When an exception is thrown in the given function, we return a resolved Promise, or a Promise that is rejected with
 * the original error object, depending on the `catchErr` flag.
 */
export async function ErrorPopup<
  T extends anyFunction = anyFunction,
  K = ReturnType<T> extends Promise<infer R> ? R : ReturnType<T>,
>(anythingThatMightEmitError: T, catchErr = true): Promise<void | K> {
  try {
    const result = anythingThatMightEmitError();
    if (isPromise<K, ReturnType<T>>(result)) {
      const caughtPromise = result.catch((err) => processError(err));
      if (catchErr) {
        return caughtPromise;
      }
      return result;
    } else {
      return Promise.resolve(result);
    }
  } catch (err: any) {
    processError(err);
    return catchErr ? Promise.resolve() : Promise.reject(err);
  }
}
