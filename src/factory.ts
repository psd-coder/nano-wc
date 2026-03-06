// oxlint-disable max-classes-per-file
import { atom } from "nanostores";

import type {
  AnySchema,
  ComponentProps,
  Infer,
  InferRefs,
  PropsSchema,
  ReactiveProps,
  RefsSchema,
} from "./types";
import { UIComponent, type ComponentCtor, type SetupFn } from "./UIComponent";
import { camelToKebab, invariant } from "./utils.ts";

function belongsTo(element: Element, host: HTMLElement): boolean {
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== host) {
    if (ancestor.tagName.includes("-")) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

function refSelector(ref: string, hostTag?: string): string {
  return `[data-ref="${hostTag ? `${hostTag}:` : ""}${ref}"]`;
}

function isDangerousPrototypeProp(host: HTMLElement, key: string): boolean {
  let proto = Object.getPrototypeOf(host);
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (desc) {
      return typeof desc.value === "function" || !desc.configurable;
    }
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

export function parseWithSchema<S extends AnySchema>(
  schema: S,
  value: unknown,
  context: string,
): Infer<S> {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new TypeError(`${context}: async schemas not supported`);
  }
  if (result.issues) {
    throw new TypeError(
      `${context}: invalid value ${JSON.stringify(value)} — ${result.issues.map((i) => i.message).join(", ")}`,
    );
  }
  return result.value as Infer<S>;
}

type PropUpdaters<Schema extends PropsSchema> = {
  [Key in keyof Schema]: (value: string | null) => void;
};

type ReactivePropsResult<Schema extends PropsSchema> = {
  stores: ReactiveProps<Schema>;
  updaters: PropUpdaters<Schema>;
};

export function createReactiveProps<Schema extends PropsSchema>(
  host: HTMLElement,
  schema: Schema,
): ReactivePropsResult<Schema> {
  const stores = {} as ReactiveProps<Schema>;
  const updaters = {} as PropUpdaters<Schema>;

  for (const key of Object.keys(schema) as (keyof Schema & string)[]) {
    const propSchema = schema[key];
    invariant(propSchema, `${host.tagName} component. No schema found for prop "${key}"`);
    const parseValue = (value: string | null) =>
      parseWithSchema(propSchema, value, `${host.tagName} component. Prop "${key}"`);

    const attrName = camelToKebab(key);
    const store = atom(parseValue(host.getAttribute(attrName)));
    const updater = (value: string | null) => store.set(parseValue(value));

    (stores as Record<string, unknown>)[`$${key}`] = store;
    updaters[key] = updater;

    invariant(!isDangerousPrototypeProp(host, key), `reserved prop: ${key}`);
    Object.defineProperty(host, key, {
      enumerable: true,
      get() {
        return store.get();
      },
      set(value: string | null) {
        if (value === null) {
          host.removeAttribute(attrName);
        } else {
          host.setAttribute(attrName, String(value));
        }
      },
    });
  }

  return { stores, updaters };
}

export function collectRefs<Refs extends RefsSchema>(
  host: HTMLElement,
  schema: Refs,
): InferRefs<Refs> {
  const result = {} as InferRefs<Refs>;
  const missingSingleRefs: string[] = [];
  const hostTag = host.tagName.toLowerCase();

  for (const key of Object.keys(schema) as (keyof Refs & string)[]) {
    const entry = schema[key];
    invariant(entry, `${host.tagName} component. No schema found for ref "${key}"`);
    const isListRef = "__list" in entry && entry.__list === true;
    const sel = entry.__selector ?? refSelector(key);
    const ownedSel = refSelector(key, hostTag);
    const all = host.querySelectorAll(`${sel},${ownedSel}`);
    const shallow: Element[] = [];
    all.forEach((el) => {
      if (el.matches(ownedSel) || belongsTo(el, host)) shallow.push(el);
    });

    if (isListRef) {
      invariant(
        shallow.length > 0,
        `${host.tagName} component. Missing elements for list ref "${key}"`,
      );
      result[key] = shallow.map((el) =>
        parseWithSchema(entry.schema, el, `${host.tagName} component. List ref "${key}"`),
      ) as InferRefs<Refs>[typeof key];
    } else {
      if (!shallow[0]) {
        missingSingleRefs.push(key);
        continue;
      }
      result[key] = parseWithSchema(
        entry.schema,
        shallow[0],
        `${host.tagName} component. Ref "${key}"`,
      ) as InferRefs<Refs>[typeof key];
    }
  }

  if (missingSingleRefs.length > 0) {
    throw new Error(
      `${host.tagName} component. Missing elements for refs "${missingSingleRefs.join(", ")}"`,
    );
  }

  return result;
}

export function createComponent<
  const Name extends string,
  Props extends PropsSchema,
  Refs extends RefsSchema,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Mixin = {},
>(
  name: Name,
  propsSchema: Props,
  refsSchema: Refs,
  setupFn: SetupFn<Props, Refs>,
): ComponentCtor<Name, Props, Refs, Mixin> {
  if (customElements.get(name)) {
    console.warn(`${name} already defined, reusing existing class`);
    return customElements.get(name) as ComponentCtor<Name, Props, Refs, Mixin>;
  }

  const attrToPropKey: Record<string, string> = Object.fromEntries(
    Object.keys(propsSchema).map((k) => [camelToKebab(k), k]),
  );

  class Component extends UIComponent<Props, Refs> {
    static readonly elementName = name;
    #props!: ReactivePropsResult<Props>;

    get host(): HTMLElement & ComponentProps<Props> {
      return this as HTMLElement & ComponentProps<Props>;
    }

    get refs(): InferRefs<Refs> {
      return this.withCache("refs", () => {
        // Lazily upgrade custom-element descendants so they resolve as fully
        // initialized instances when refs are first accessed. Placed here
        // (not in connectedCallback) so the parent's mixin is already assigned
        // before children connect — child setup can consume() parent methods.
        customElements.upgrade(this);
        return collectRefs(this, refsSchema);
      });
    }

    get props(): ReactiveProps<Props> {
      return this.#props.stores;
    }

    static get observedAttributes() {
      return Object.keys(propsSchema).map(camelToKebab);
    }

    constructor() {
      super();
      this.#props = createReactiveProps(this, propsSchema);
    }

    attributeChangedCallback(attrName: string, oldValue: string | null, newValue: string | null) {
      if (oldValue === newValue) return;
      const propKey = attrToPropKey[attrName] as keyof Props | undefined;
      const updater = propKey ? this.#props.updaters[propKey] : undefined;
      invariant(
        updater,
        `${this.constructor.name} component. No prop updater found for attribute "${attrName}"`,
      );
      updater(newValue);
    }

    connectedCallback() {
      const result = setupFn(this);
      if (result) {
        const proto = Object.getPrototypeOf(this);
        const descriptors = Object.getOwnPropertyDescriptors(result);
        for (const key of Object.keys(descriptors)) {
          invariant(!(key in proto), `reserved mixin: ${key}`);
        }
        Object.defineProperties(this, descriptors);
      }
    }
  }

  // Cast to string to avoid HTMLElementTagNameMap circular reference during type inference
  customElements.define(name as string, Component);
  return Component as unknown as ComponentCtor<Name, Props, Refs, Mixin>;
}
