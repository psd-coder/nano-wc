import * as v from "valibot";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { ListRefMarker, SingleRefMarker } from "./types";

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

const TAG_RE = /^[a-z][a-z0-9-]*$/;

function parseRefArgs(tagOrSelector?: string | readonly string[]) {
  const tag =
    typeof tagOrSelector === "string" && TAG_RE.test(tagOrSelector) ? tagOrSelector : undefined;
  const sel = typeof tagOrSelector === "string" && !tag ? tagOrSelector : undefined;
  return {
    ...(sel && { __selector: sel }),
    schema: buildRefSchema(tag),
  };
}

function one(): SingleRefMarker;
function one<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): SingleRefMarker<Tag>;
function one<const Tag extends keyof HTMLElementTagNameMap>(selector: string): SingleRefMarker<Tag>;
function one<const Tags extends readonly (keyof HTMLElementTagNameMap)[]>(
  tags: Tags,
): SingleRefMarker<Tags[number]>;
function one(selectors: readonly string[]): SingleRefMarker;
function one<El extends Element>(): SingleRefMarker & { readonly __el: El };
function one<El extends Element>(selector: string): SingleRefMarker & { readonly __el: El };
function one(selector: string): SingleRefMarker;
function one(tagOrSelector?: string | readonly string[]): SingleRefMarker {
  return parseRefArgs(tagOrSelector) as SingleRefMarker;
}

function many(): ListRefMarker;
function many<const Tag extends keyof HTMLElementTagNameMap>(tag: Tag): ListRefMarker<Tag>;
function many<const Tag extends keyof HTMLElementTagNameMap>(selector: string): ListRefMarker<Tag>;
function many<const Tags extends readonly (keyof HTMLElementTagNameMap)[]>(
  tags: Tags,
): ListRefMarker<Tags[number]>;
function many(selectors: readonly string[]): ListRefMarker;
function many<El extends Element>(): ListRefMarker & { readonly __el: El };
function many<El extends Element>(selector: string): ListRefMarker & { readonly __el: El };
function many(selector: string): ListRefMarker;
function many(tagOrSelector?: string | readonly string[]): ListRefMarker {
  return { __list: true as const, ...parseRefArgs(tagOrSelector) } as ListRefMarker;
}

export const refBuilders: { one: typeof one; many: typeof many } = {
  one,
  many,
};
