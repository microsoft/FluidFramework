/**
 * Simple utility for assisting in writing promises when using the promise constructor is a bit clunky.
 */
export class Deferred<T> implements Promise<T> {
  [Symbol.toStringTag]: string = 'Deferred';

  private readonly p: Promise<T>;
  private res!: (value: T | PromiseLike<T>) => void;
  private rej!: (reason?: any) => void;
  private isPending: boolean = true;
  constructor() {
    this.p = new Promise((resolve, reject) => {
      this.res = resolve;
      this.rej = reject;
    });
  }

  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): Promise<TResult1 | TResult2> {
    return this.p.then(onfulfilled, onrejected);
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined
  ): Promise<T | TResult> {
    return this.p.catch(onrejected);
  }

  public resolve(value: T | PromiseLike<T>) {
    this.isPending = false;
    this.res(value);
  }

  public reject(reason?: any) {
    this.isPending = false;
    this.rej(reason);
  }

  public pending() {
    return this.isPending;
  }

  public finally(onFinally?: (() => void) | undefined | null): Promise<T> {
    return this.p.finally(onFinally);
  }
}
