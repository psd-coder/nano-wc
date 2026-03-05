import * as v from "valibot";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { ListRefMarker, RefOptions, SingleRefMarker } from "./types";

function getBaseSchema<V>(fallback?: V) {
  return fallback !== undefined ? v.nullish(v.unknown(), fallback) : v.unknown();
}

export const propBuilders: {
  string: (fallback?: string) => StandardSchemaV1<unknown, string>;
  number: (fallback?: number) => StandardSchemaV1<unknown, number>;
  boolean: (fallback?: boolean) => StandardSchemaV1<unknown, boolean>;
  list: <const V extends string | number | bigint>(
    options: readonly V[],
    fallback?: V,
  ) => StandardSchemaV1<unknown, V>;
} = {
  string: (fallback?: string) =>
    v.pipe(
      getBaseSchema(fallback),
      v.transform((val) => (val == null ? "" : val)),
      v.toString(),
    ),
  number: (fallback?: number) => v.pipe(getBaseSchema(fallback), v.toNumber()),
  boolean: (fallback?: boolean) =>
    v.pipe(
      getBaseSchema(fallback),
      v.union([v.literal("true"), v.literal("false"), v.literal(""), v.null()]),
      v.transform((str) => str === "true" || str === ""),
    ),
  list: <const V extends string | number | bigint>(options: readonly V[], fallback?: V) =>
    v.pipe(getBaseSchema(fallback), v.picklist(options)),
};

function buildRefSchema(tag: string | undefined) {
  return tag
    ? v.pipe(
        v.instance(Element),
        v.check((el) => el.tagName.toLowerCase() === tag, `Expected <${tag}>`),
      )
    : v.instance(Element);
}

function one(): SingleRefMarker;
function one(options: RefOptions): SingleRefMarker;
function one<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): SingleRefMarker<Tag>;
function one<const Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  options: RefOptions,
): SingleRefMarker<Tag>;
function one<const Tag extends keyof HTMLElementTagNameMap>(
  options: RefOptions,
): SingleRefMarker<Tag>;
function one(tagOrOptions?: string | RefOptions, options?: RefOptions): SingleRefMarker {
  const tag = typeof tagOrOptions === "string" ? tagOrOptions : undefined;
  const opts = typeof tagOrOptions === "object" ? tagOrOptions : options;
  return {
    ...(tag && { __tag: tag }),
    ...(opts && { __options: opts }),
    schema: buildRefSchema(tag),
  } as SingleRefMarker;
}

function many(): ListRefMarker;
function many(options: RefOptions): ListRefMarker;
function many<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): ListRefMarker<Tag>;
function many<const Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  options: RefOptions,
): ListRefMarker<Tag>;
function many<const Tag extends keyof HTMLElementTagNameMap>(
  options: RefOptions,
): ListRefMarker<Tag>;
function many(tagOrOptions?: string | RefOptions, options?: RefOptions): ListRefMarker {
  const tag = typeof tagOrOptions === "string" ? tagOrOptions : undefined;
  const opts = typeof tagOrOptions === "object" ? tagOrOptions : options;
  return {
    __list: true as const,
    ...(tag && { __tag: tag }),
    ...(opts && { __options: opts }),
    schema: buildRefSchema(tag),
  } as ListRefMarker;
}

export const refBuilders: { one: typeof one; many: typeof many } = {
  one,
  many,
};
