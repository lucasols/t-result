import { isFunction, isObject, isPromise } from '@ls-stack/utils/assertions';
import { safeJsonStringify } from '@ls-stack/utils/safeJson';

/**
 * Represents a successful result containing a value
 * @template T - The type of the success value
 */
type Ok<T> = {
  ok: true;
  error: false;
  value: T;
} & AnyResultMethods;

type AnyResultMethods = Record<ResultMethodsKeys, never>;

/**
 * Valid error types that can be used in Result error states
 */
export type ResultValidErrors =
  | Error
  | Record<string, unknown>
  | unknown[]
  | readonly unknown[]
  | true;

/**
 * Represents a failed result containing an error
 * @template E - The type of the error value
 */
type Err<E extends ResultValidErrors> = {
  ok: false;
  error: E;
  /** Returns a new Err result with the same error */
  errorResult: () => Err<E>;
} & AnyResultMethods;

/**
 * Methods available on all Result instances for chaining and manipulation
 * @template T - The type of the success value
 * @template E - The type of the error value
 */
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
  /** @deprecated use onOk instead */
  ifOk: (fn: (value: T) => void) => Result<T, E>;
  /** Calls a function if the result is Ok */
  onOk: (fn: (value: T) => void) => Result<T, E>;
  /** @deprecated use onErr instead */
  ifErr: (fn: (error: E) => void) => Result<T, E>;
  /** Calls a function if the result is Err */
  onErr: (fn: (error: E) => void) => Result<T, E>;
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
 *
 * @template T - The type of the success value
 * @template E - The type of the error value, defaults to Error
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
    onOk: okOnOk,
    onErr: returnResult,
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
    onOk: returnResult,
    ifErr: errOnErr,
    onErr: errOnErr,
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

/**
 * Converts an unknown error value into an Err result
 * @param error - The unknown error value
 * @returns An Err result containing an Error instance
 */
function unknownToResultError(error: unknown): Err<Error> {
  return err(unknownToError(error));
}

/**
 * Unwraps a promise result by awaiting it and returning the value or throwing the error
 * @template T - The type of the success value
 * @param result - Promise containing a Result
 * @returns Promise that resolves to the unwrapped value or rejects with the error
 */
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

/**
 * Provides mapping functions for async Result operations
 * @template T - The type of the success value
 * @template E - The type of the error value
 * @param resultPromise - Promise containing a Result
 * @returns Object with mapping methods for async operations
 */
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

/**
 * Creates an Err result with an error object containing a unique id.
 *
 * @param id - The identifier for the error.
 * @returns An Err result with an error object of the form { id }.
 */
function errId<E extends string>(id: E): Err<{ id: E }> {
  return err({ id });
}

/**
 * Namespace object containing all Result utility functions
 */
export const Result: {
  ok: typeof ok;
  err: typeof err;
  unknownToError: typeof unknownToResultError;
  asyncUnwrap: typeof asyncUnwrap;
  asyncMap: typeof asyncMap;
  getOkErr: typeof getOkErr;
  errId: typeof errId;
} = {
  ok,
  err,
  unknownToError: unknownToResultError,
  asyncUnwrap,
  asyncMap,
  getOkErr,
  errId,
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

/**
 * Type helper for creating typed Result functions with specific value and error types
 * @template T - The type of the success value
 * @template E - The type of the error value
 */
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

/**
 * Utility type to extract the TypedResult from a Result type
 * @template R - A Result type to extract types from
 */
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

/**
 * Creates a typed result helper for functions returning Promise<Result>
 * @template F - Function type that returns Promise<Result>
 * @returns TypedResult with extracted types from the function's return type
 */
function getOkErr<
  F extends (...args: any[]) => Promise<Result<any, any>>,
>(): TypedResult<
  Awaited<ReturnType<F>> extends Result<infer T, any> ? T : never,
  Awaited<ReturnType<F>> extends Result<any, infer E> ? E : never
>;
/**
 * Creates a typed result helper for functions returning Result
 * @template F - Function type that returns Result
 * @returns TypedResult with extracted types from the function's return type
 */
function getOkErr<
  F extends (...args: any[]) => Result<any, any>,
>(): TypedResult<
  ReturnType<F> extends Result<infer T, any> ? T : never,
  ReturnType<F> extends Result<any, infer E> ? E : never
>;
/**
 * Creates a typed result helper from a Result type
 * @template R - A Result type
 * @returns TypedResult with extracted types from the Result type
 */
function getOkErr<R extends Result<any, any>>(): TypedResult<
  R extends Result<infer T, any> ? T : never,
  R extends Result<any, infer E> ? E : never
>;
/**
 * Creates a typed result helper with explicit types
 * @template T - The success value type
 * @template E - The error value type
 * @returns TypedResult with the specified types
 */
function getOkErr<T, E extends ResultValidErrors = Error>(): TypedResult<T, E>;
function getOkErr(): unknown {
  return typedResult;
}

/**
 * Type guard to check if a value is a Result
 * @param value - The value to check
 * @returns True if the value is a Result, false otherwise
 * @example
 * if (isResult(someValue)) {
 *   // someValue is now typed as Result<any, ResultValidErrors>
 *   console.log(someValue.ok);
 * }
 */
export function isResult(
  value: unknown,
): value is Result<any, ResultValidErrors> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof value.ok === 'boolean' &&
    'error' in value &&
    hasMethod(value, 'unwrapOrNull') &&
    hasMethod(value, 'unwrapOr') &&
    hasMethod(value, 'unwrap') &&
    hasMethod(value, 'mapOk') &&
    hasMethod(value, 'mapErr') &&
    hasMethod(value, 'mapOkAndErr') &&
    hasMethod(value, 'onOk') &&
    hasMethod(value, 'onErr')
  );
}

function hasMethod(value: Record<string, unknown>, method: string): boolean {
  return method in value && typeof value[method] === 'function';
}
