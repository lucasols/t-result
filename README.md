# TS Result

[![npm version](https://badge.fury.io/js/t-result.svg)](https://badge.fury.io/js/t-result)

A TypeScript implementation of the Result pattern, providing a robust way to handle operations that can succeed or fail, without relying on traditional try/catch blocks for expected errors.

## Features

- **Explicit Success/Failure:** Clearly distinguish between `Ok<T>` (success) and `Err<E>` (failure) states.
- **Type Safety:** Strong typing for both success values (`T`) and error types (`E`).
- **Chaining Methods:** Fluent API with methods like `mapOk`, `mapErr`, `unwrapOr`, `ifOk`, `ifErr` for elegant data transformation and error handling.
- **Error Normalization:** Utilities like `unknownToError` to consistently convert various error types into `Error` objects.
- **Asynchronous Support:** Helpers for working with `Result` types in asynchronous operations (`Result.asyncUnwrap`, `Result.asyncMap`).
- **Function Wrapping:** `resultify` function to easily convert existing functions or promises to return `Result` objects.
- **Typed Helpers:** `getOkErr` to create type-safe `ok` and `err` constructors for specific `Result` signatures.

## Installation

```bash
npm install t-result
# or
yarn add t-result
```

## Basic Usage

```typescript
import { Result } from 't-result';

// Define a function that might fail
function divide(
  numerator: number,
  denominator: number,
): Result<number, string> {
  if (denominator === 0) {
    return Result.err('Cannot divide by zero!');
  }
  return Result.ok(numerator / denominator);
}

const result1 = divide(10, 2);

if (result1.ok) {
  console.log('Result:', result1.value); // Output: Result: 5
} else {
  console.error('Error:', result1.error);
}

const result2 = divide(10, 0);

if (result2.ok) {
  console.log('Result:', result2.value);
} else {
  console.error('Error:', result2.error); // Output: Error: Cannot divide by zero!
}

// Using chaining methods
const processedResult = divide(20, 2)
  .mapOk((value) => value * 2) // Multiply if Ok
  .mapErr((errorMsg) => `Computation failed: ${errorMsg}`);

if (processedResult.ok) {
  console.log('Processed Value:', processedResult.value); // Output: Processed Value: 20
} else {
  console.error('Processed Error:', processedResult.error);
}
```

## API

### `Result<T, E extends ResultValidErrors = Error>`

A union type representing either a successful outcome (`Ok<T>`) or an error (`Err<E>`).

- `T`: The type of the value in case of success.
- `E`: The type of the error in case of failure. Defaults to `Error`. `ResultValidErrors` includes `Error`, `Record<string, unknown>`, `unknown[]`, `readonly unknown[]`, or `true`.

An object of type `Result<T, E>` will have:

- `ok: boolean`: `true` if the result is `Ok<T>`, `false` if `Err<E>`.
- `value: T`: (Only if `ok` is `true`) The successful value.
- `error: E`: (Only if `ok` is `false`) The error value.

**Methods available on `Result` objects:**

- `unwrapOrNull(): T | null`: Returns the value if `Ok`, otherwise `null`.
- `unwrapOr<R extends T>(defaultValue: R): T | R`: Returns the value if `Ok`, otherwise `defaultValue`.
- `unwrap(): T`: Returns the value if `Ok`, otherwise throws the error (or an `Error` wrapping the error if it's not an `Error` instance).
- `mapOk<NewValue>(mapFn: (value: T) => NewValue): Result<NewValue, E>`: If `Ok`, applies `mapFn` to the value and returns a new `Ok<NewValue>`. Otherwise, returns the original `Err<E>`.
- `mapErr<NewError extends ResultValidErrors>(mapFn: (error: E) => NewError): Result<T, NewError>`: If `Err`, applies `mapFn` to the error and returns a new `Err<NewError>`. Otherwise, returns the original `Ok<T>`.
- `mapOkAndErr<NewValue, NewError extends ResultValidErrors>(mapFns: { ok: (value: T) => NewValue; err: (error: E) => NewError; }): Result<NewValue, NewError>`: Applies the appropriate mapping function based on whether the result is `Ok` or `Err`.
- `ifOk(fn: (value: T) => void): Result<T, E>`: If `Ok`, calls `fn` with the value. Returns the original `Result`.
- `ifErr(fn: (error: E) => void): Result<T, E>`: If `Err`, calls `fn` with the error. Returns the original `Result`.

### `ok<T>(value: T): Ok<T>`

### `ok(): Ok<void>`

Creates an `Ok` result, representing a successful operation.

- `value` (optional): The value of the successful operation. If not provided, defaults to `Ok<void>`.

### `err<E extends ResultValidErrors>(error: E): Err<E>`

Creates an `Err` result, representing a failed operation.

- `error`: The error value.

An `Err<E>` object also has an `errorResult(): Err<E>` method that returns a new `Err` result with the same error.

### `Result` Namespace/Object

A utility object with helper functions:

- `Result.ok: typeof ok`: Reference to the `ok` function.
- `Result.err: typeof err`: Reference to the `err` function.
- `Result.unknownToError(error: unknown): Err<Error>`: Converts an unknown caught value into an `Err<Error>`. Internally uses `unknownToError`.
- `Result.asyncUnwrap<T>(result: Promise<Result<T, ResultValidErrors>>): Promise<T>`: Unwraps a `Promise` that resolves to a `Result`. If the `Result` is `Ok`, resolves with the value. If `Err`, rejects with the error.
- `Result.asyncMap<T, E extends ResultValidErrors>(resultPromise: Promise<Result<T, E>>)`: Provides methods to map over a `Promise<Result<T,E>>`:
  - `.ok<NewValue>(mapFn: (value: T) => NewValue): Promise<Result<NewValue, E>>`
  - `.err<NewError extends ResultValidErrors>(mapFn: (error: E) => NewError): Promise<Result<T, NewError>>`
  - `.okAndErr<NewValue, NewError extends ResultValidErrors>(mapFns: { ok: (value: T) => NewValue; err: (error: E) => NewError; }): Promise<Result<NewValue, NewError>>`
- `Result.getOkErr`: See `getOkErr` documentation below.

### `resultify`

Converts a function call or a Promise into a `Result` or `Promise<Result>`.

**Overloads:**

1.  `resultify<T, E extends ResultValidErrors = Error>(fn: () => T extends Promise<any> ? never : T, errorNormalizer?: (err: unknown) => E): Result<T, E>`
    - For synchronous functions that do not return a Promise.
2.  `resultify<T, E extends ResultValidErrors = Error>(fn: () => Promise<T>, errorNormalizer?: (err: unknown) => E): Promise<Result<Awaited<T>, E>>`
    - For functions that return a Promise.
3.  `resultify<T, E extends ResultValidErrors = Error>(fn: Promise<T>, errorNormalizer?: (err: unknown) => E): Promise<Result<T, E>>`
    - For existing Promises.

- `fn`: The function to execute or the Promise to wrap.
- `errorNormalizer` (optional): A function to transform caught errors. If not provided, `unknownToError` is used.

### `unknownToError(error: unknown): Error`

Converts an unknown error value (e.g., from a `catch` block) into an `Error` object.

- If `error` is already an `Error`, it's returned directly.
- If `error` is a string, it becomes the message of a new `Error`.
- If `error` is an object, it attempts to use `error.message` or stringifies the object.
- Other types are stringified.
- The original error is preserved as the `cause` property of the returned `Error`.

### `getOkErr` and `TypedResult<T, E>`

`getOkErr` is a utility to create typed `ok` and `err` factory functions for a specific `Result` signature.

`type TypedResult<T, E extends ResultValidErrors = Error> = { ok: (value: T) => Ok<T>; err: (error: E) => Err<E>; _type: Result<T, E>; };`

**Overloads for `getOkErr`:**

1.  `getOkErr<F extends (...args: any[]) => Promise<Result<any, any>>>(): TypedResult<Awaited<ReturnType<F>> extends Result<infer T, any> ? T : never, ...>`
    - Infers types from an async function returning `Result`.
2.  `getOkErr<F extends (...args: any[]) => Result<any, any>>>(): TypedResult<ReturnType<F> extends Result<infer T, any> ? T : never, ...>`
    - Infers types from a sync function returning `Result`.
3.  `getOkErr<R extends Result<any, any>>(): TypedResult<R extends Result<infer T, any> ? T : never, ...>`
    - Infers types from an existing `Result` type.
4.  `getOkErr<T, E extends ResultValidErrors = Error>(): TypedResult<T, E>`
    - Explicitly provide `T` and `E`.

The `_type` property on `TypedResult` can be used with `typeof` to get the `Result<T,E>` type (e.g., `function foo(): typeof myTypedResult._type { ... }`).

## Examples

### Creating and Handling Results

```typescript
import { Result } from 't-result';

function parseNumber(input: string): Result<number, string> {
  const num = parseFloat(input);
  if (isNaN(num)) {
    return Result.err(`'${input}' is not a valid number.`);
  }
  return Result.ok(num);
}

const validResult = parseNumber('123.45');
validResult
  .ifOk((value) => console.log(`Parsed: ${value}`)) // Parsed: 123.45
  .ifErr((error) => console.error(`Error: ${error}`));

const invalidResult = parseNumber('abc');
const valueOrDefault = invalidResult.unwrapOr(0);
console.log(`Value or default: ${valueOrDefault}`); // Value or default: 0

try {
  const unwrappedValue = invalidResult.unwrap(); // This will throw
  console.log(unwrappedValue);
} catch (e: any) {
  console.error(`Caught error: ${e.message}`); // Caught error: 'abc' is not a valid number.
}
```

### Using `resultify`

```typescript
import { resultify, unknownToError, Result } from 't-result';

// Synchronous function
function riskySyncOperation(shouldFail: boolean): string {
  if (shouldFail) {
    throw new Error('Sync operation failed!');
  }
  return 'Sync success!';
}

const syncRes = resultify(() => riskySyncOperation(false));
syncRes.ifOk((val) => console.log(val)); // Sync success!

const failingSyncRes = resultify(() => riskySyncOperation(true));
failingSyncRes.ifErr((err) => console.error(err.message)); // Sync operation failed!

// Asynchronous function / Promise
async function riskyAsyncOperation(shouldFail: boolean): Promise<string> {
  if (shouldFail) {
    throw new Error('Async operation failed!');
  }
  return 'Async success!';
}

async function testAsync() {
  const asyncRes = await resultify(() => riskyAsyncOperation(false));
  asyncRes.ifOk((val) => console.log(val)); // Async success!

  const failingAsyncRes = await resultify(riskyAsyncOperation(true));
  failingAsyncRes.ifErr((err) => console.error(err.message)); // Async operation failed!

  // With custom error normalization
  class CustomError extends Error {
    constructor(
      message: string,
      public code: number,
    ) {
      super(message);
    }
  }

  const customErrorRes = await resultify(
    () => riskyAsyncOperation(true),
    (unknownErr) => {
      const baseError = unknownToError(unknownErr);
      return new CustomError(baseError.message, 500);
    },
  );
  customErrorRes.ifErr((customErr) =>
    console.error(`${customErr.code}: ${customErr.message}`),
  ); // 500: Async operation failed!
}

testAsync();
```

### Using `unknownToError`

```typescript
import { unknownToError } from 't-result';

try {
  // Simulate an operation that might throw anything
  throw { detail: 'Something went wrong', code: 101 };
} catch (caughtError) {
  const error = unknownToError(caughtError);
  console.error(`Error Message: ${error.message}`); // Error Message: {"detail":"Something went wrong","code":101}
  if (error.cause) {
    console.error(`Original Cause:`, error.cause); // Original Cause: { detail: 'Something went wrong', code: 101 }
  }
}

try {
  throw 'A simple string error';
} catch (caughtError) {
  const error = unknownToError(caughtError);
  console.error(`Error Message: ${error.message}`); // Error Message: A simple string error
}
```

### Using `getOkErr` for Typed Results

```typescript
import { Result, getOkErr } from 't-result';

type User = { id: number; name: string };
type UserFetchError = { type: 'NotFound' | 'NetworkError'; message: string };

// Create typed ok/err factories
const UserResult = getOkErr<User, UserFetchError>();

function fetchUser(userId: number): typeof UserResult._type {
  // Use _type for return type
  if (userId <= 0) {
    return UserResult.err({
      type: 'NotFound',
      message: 'User ID must be positive.',
    });
  }
  if (Math.random() < 0.2) {
    // Simulate network error
    return UserResult.err({
      type: 'NetworkError',
      message: 'Failed to connect.',
    });
  }
  return UserResult.ok({ id: userId, name: 'Jane Doe' });
}

const userResult = fetchUser(1);
userResult.mapOkAndErr({
  ok: (user) => console.log(`Fetched user: ${user.name}`),
  err: (error) => console.error(`Error (${error.type}): ${error.message}`),
});
```
