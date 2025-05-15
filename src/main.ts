import { isFunction, isObject, isPromise } from '@ls-stack/utils/assertions';
import { safeJsonStringify } from '@ls-stack/utils/safeJson';

type Ok<T> = {
  ok: true;
  error: false;
  value: T;
} & AnyResultMethods;

type AnyResultMethods = Record<ResultMethodsKeys, never>;

export type ResultValidErrors =
  | Error
  | Record<string, unknown>
  | unknown[]
  | readonly unknown[]
  | true;

type Err<E extends ResultValidErrors> = {
  ok: false;
  error: E;
  /** Returns a new Err result with the same error */
  errorResult: () => Err<E>;
} & AnyResultMethods;

type ResultMethods<T, E extends ResultValidErrors> = {
  /** Returns the value if the result is Ok, otherwise returns null */
  unwrapOrNull: () => T | null;
  /** Returns the value if the result is Ok, otherwise returns the provided default value */
  unwrapOr: <R extends T>(defaultValue: R) => T | R;
  /** Returns the value if the result is Ok, otherwise throws the error */
  unwrap: () => T;
  /** Maps the value if the result is Ok */
  mapOk: <NewValue>(mapFn: (value: T) => NewValue) => Result<NewValue, E>;
  /** Maps the error if the result is Err */
  mapErr: <NewError extends ResultValidErrors>(
    mapFn: (error: E) => NewError,
  ) => Result<T, NewError>;
  /** Maps the value and error if the result is Ok or Err */
  mapOkAndErr: <NewValue, NewError extends ResultValidErrors>(mapFns: {
    ok: (value: T) => NewValue;
    err: (error: E) => NewError;
  }) => Result<NewValue, NewError>;
  /** Calls a function if the result is Ok */
  ifOk: (fn: (value: T) => void) => Result<T, E>;
  /** Calls a function if the result is Err */
  ifErr: (fn: (error: E) => void) => Result<T, E>;
};

/**
 * Util for implementing something similar to Result<T, E> in Rust, for better error handling.
 *
 * Usage:
 *
 * @example
 * function doSomething(): Result<string, Error> {
 *  if (something) {
 *    return ok('success');
 *  }
 *
 *  return err(new Error('something went wrong'));
 * }
 *
 * const result = doSomething();
 *
 * if (result.ok) {
 *   // result.value is a string
 * } else {
 *   // result.error is an Error
 * }
 */
export type Result<T, E extends ResultValidErrors = Error> = (
  | Omit<Ok<T>, ResultMethodsKeys>
  | Omit<Err<E>, ResultMethodsKeys>
) &
  ResultMethods<T, E>;

type ResultMethodsKeys = keyof ResultMethods<any, any>;

function okUnwrapOr<T>(this: Ok<T>) {
  return this.value;
}

function okMap<T, NewValue>(
  this: Result<T, any>,
  mapFn: (value: T) => NewValue,
) {
  return this.ok ? ok(mapFn(this.value)) : this;
}

function errMap<
  E extends ResultValidErrors,
  NewError extends ResultValidErrors,
>(
  this: Result<any, E>,
  mapFn: (error: E) => ResultValidErrors,
): Result<any, NewError> {
  return this.ok ? (this as any) : err(mapFn(this.error) as NewError);
}

function mapOkAndErr<
  T,
  E extends ResultValidErrors,
  NewValue,
  NewError extends ResultValidErrors,
>(
  this: Result<T, E>,
  {
    ok: mapFn,
    err: mapErrFn,
  }: {
    ok: (value: T) => NewValue;
    err: (error: E) => NewError;
  },
) {
  return this.ok ? ok(mapFn(this.value)) : err(mapErrFn(this.error));
}

function returnResult(this: Result<any, any>) {
  return this;
}

function okOnOk<T, E extends ResultValidErrors>(
  this: Result<T, E>,
  fn: (value: T) => void,
): Result<T, E> {
  if (this.ok) {
    fn(this.value);
  }
  return this;
}

function errOnErr<T, E extends ResultValidErrors>(
  this: Result<T, E>,
  fn: (error: E) => void,
): Result<T, E> {
  if (!this.ok) {
    fn(this.error);
  }
  return this;
}

/**
 * Creates a void Ok result
 */
export function ok(): Ok<void>;
/**
 * Creates an Ok result
 *
 * @param value - The value to wrap in the Ok result
 * @returns A new Ok result
 */
export function ok<T>(value: T): Ok<T>;
export function ok(value: any = undefined): Ok<any> {
  const methods: ResultMethods<any, any> = {
    unwrapOrNull: okUnwrapOr,
    unwrapOr: okUnwrapOr,
    unwrap: okUnwrapOr,
    mapOk: okMap,
    mapErr: returnResult,
    mapOkAndErr,
    ifOk: okOnOk,
    ifErr: returnResult,
  };

  return {
    ok: true,
    error: false,
    value,
    ...(methods as AnyResultMethods),
  };
}

/**
 * Creates an Err result
 *
 * @param error - The error to wrap in the Err result
 * @returns A new Err result
 */
export function err<E extends ResultValidErrors>(error: E): Err<E> {
  const methods: ResultMethods<any, any> = {
    unwrapOrNull: () => null,
    unwrapOr: (defaultValue) => defaultValue,
    unwrap: (() => {
      if (error instanceof Error) {
        throw error;
      }

      throw unknownToError(error);
    }) as any,
    mapOk: returnResult,
    mapErr: errMap,
    mapOkAndErr,
    ifOk: returnResult,
    ifErr: errOnErr,
  };

  return {
    ok: false,
    error,
    errorResult() {
      return err(error);
    },
    ...(methods as AnyResultMethods),
  };
}

function unknownToResultError(error: unknown): Err<Error> {
  return err(unknownToError(error));
}

/** Unwraps a promise result */
async function asyncUnwrap<T>(
  result: Promise<Result<T, ResultValidErrors>>,
): Promise<T> {
  const unwrapped = await result;

  if (unwrapped.ok) {
    return unwrapped.value;
  }

  if (unwrapped.error instanceof Error) {
    throw unwrapped.error;
  }

  throw unknownToError(unwrapped.error);
}

function asyncMap<T, E extends ResultValidErrors>(
  resultPromise: Promise<Result<T, E>>,
) {
  return {
    err: async <NewError extends ResultValidErrors>(
      mapFn: (error: E) => NewError,
    ): Promise<Result<T, NewError>> => {
      const result = await resultPromise;
      return result.ok ? ok(result.value) : err(mapFn(result.error));
    },
    ok: async <NewValue>(
      mapFn: (value: T) => NewValue,
    ): Promise<Result<NewValue, E>> => {
      const result = await resultPromise;
      return result.ok ? ok(mapFn(result.value)) : err(result.error);
    },
    okAndErr: async <NewValue, NewError extends ResultValidErrors>({
      ok: mapFn,
      err: mapErrFn,
    }: {
      ok: (value: T) => NewValue;
      err: (error: E) => NewError;
    }): Promise<Result<NewValue, NewError>> => {
      const result = await resultPromise;
      return result.ok ? ok(mapFn(result.value)) : err(mapErrFn(result.error));
    },
  };
}

export const Result: {
  ok: typeof ok;
  err: typeof err;
  unknownToError: typeof unknownToResultError;
  asyncUnwrap: typeof asyncUnwrap;
  asyncMap: typeof asyncMap;
  getOkErr: typeof getOkErr;
} = {
  ok,
  err,
  unknownToError: unknownToResultError,
  asyncUnwrap,
  asyncMap,
  getOkErr,
};

/**
 * Converts a function response into a Result<T, E>
 */
export function resultify<T, E extends ResultValidErrors = Error>(
  fn: () => T extends Promise<any> ? never : T,
  errorNormalizer?: (err: unknown) => E,
): Result<T, E>;
/**
 * Converts a promise response into a Result<T, E>
 */
export function resultify<T, E extends ResultValidErrors = Error>(
  fn: () => Promise<T>,
  errorNormalizer?: (err: unknown) => E,
): Promise<Result<Awaited<T>, E>>;
/**
 * Converts a promise response into a Result<T, E>
 */
export function resultify<T, E extends ResultValidErrors = Error>(
  fn: Promise<T>,
  errorNormalizer?: (err: unknown) => E,
): Promise<Result<T, E>>;
export function resultify(
  fn: (() => unknown) | Promise<unknown>,
  errorNormalizer?: (err: unknown) => ResultValidErrors,
):
  | Result<unknown, ResultValidErrors>
  | Promise<Result<unknown, ResultValidErrors>> {
  if (!isFunction(fn)) {
    return fn
      .then((value) => ok(value))
      .catch((error) =>
        err(
          errorNormalizer ?
            errorNormalizer(error)
          : (unknownToError(error) as unknown as ResultValidErrors),
        ),
      );
  }

  try {
    const result = fn();

    if (isPromise(result)) {
      return result
        .then((value) => ok(value))
        .catch((error) =>
          err(
            errorNormalizer ?
              errorNormalizer(error)
            : (unknownToError(error) as unknown as ResultValidErrors),
          ),
        );
    }

    return ok(result);
  } catch (error) {
    return err(
      errorNormalizer ?
        errorNormalizer(error)
      : (unknownToError(error) as unknown as ResultValidErrors),
    );
  }
}

/**
 * Converts an unknown error value into an Error object.
 *
 * @param error - The unknown value to convert to an Error
 * @returns An Error object
 *
 * @example
 * try {
 *   // some code that might throw
 * } catch (err) {
 *   const error = unknownToError(err); // Guaranteed to be Error instance
 * }
 *
 * The function handles different error types:
 * - Returns the error directly if it's already an Error instance
 * - Converts strings into Error objects using the string as the message
 * - For objects, tries to extract a message property or stringifies the object
 * - For other values, stringifies them or uses 'unknown' as fallback
 *
 * The original error value is preserved as the `cause` property of the returned Error.
 */
export function unknownToError(error: unknown): Error {
  if (error instanceof Error) return error;

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (isObject(error)) {
    return new Error(
      'message' in error && error.message && typeof error.message === 'string' ?
        error.message
      : (safeJsonStringify(error) ?? 'unknown'),
      { cause: error },
    );
  }

  return new Error(safeJsonStringify(error) ?? 'unknown', {
    cause: error,
  });
}

export type TypedResult<T, E extends ResultValidErrors = Error> = {
  ok: (value: T) => Ok<T>;
  err: (error: E) => Err<E>;
  /**
   * Use in combination with `typeof` to get the return type of the result
   *
   * @example
   * const typedResult = createTypedResult<{ a: 'test' }>();
   *
   * function foo(): typeof typedResult.type {
   *   return typedResult.ok({ a: 'test' });
   * }
   */
  _type: Result<T, E>;
};

export type GetTypedResult<R extends Result<any, any>> = TypedResult<
  R extends Result<infer T, any> ? T : never,
  R extends Result<any, infer E> ? E : never
>;

const typedResult: TypedResult<any, any> = {
  ok,
  err,
  get _type(): any {
    throw new Error('usage as value is not allowed');
  },
};

function getOkErr<
  F extends (...args: any[]) => Promise<Result<any, any>>,
>(): TypedResult<
  Awaited<ReturnType<F>> extends Result<infer T, any> ? T : never,
  Awaited<ReturnType<F>> extends Result<any, infer E> ? E : never
>;
function getOkErr<
  F extends (...args: any[]) => Result<any, any>,
>(): TypedResult<
  ReturnType<F> extends Result<infer T, any> ? T : never,
  ReturnType<F> extends Result<any, infer E> ? E : never
>;
function getOkErr<R extends Result<any, any>>(): TypedResult<
  R extends Result<infer T, any> ? T : never,
  R extends Result<any, infer E> ? E : never
>;
function getOkErr<T, E extends ResultValidErrors = Error>(): TypedResult<T, E>;
function getOkErr(): unknown {
  return typedResult;
}
