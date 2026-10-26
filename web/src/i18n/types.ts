import type zh from "./messages/zh";

/** Shape of the Chinese dictionary — the source of truth. */
export type Messages = typeof zh;

/** Same key structure as `Messages`, but with plain string leaves. */
export type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

type DeepKeys<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object ? `${K}.${DeepKeys<T[K]>}` : K;
    }[keyof T & string]
  : never;

/** Dot-separated key union, e.g. `"skills.title"` — typos fail the build. */
export type TranslationKey = DeepKeys<Messages>;
