export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  value: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export const Ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const Err = <E>(value: E): Err<E> => ({ ok: false, value });
