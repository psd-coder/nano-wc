import { effect, type ReadableAtom, type StoreValue, type WritableAtom } from "nanostores";
import { invariant } from "./helpers";

import type {
  ComponentProps,
  Infer,
  InferRefs,
  PropsSchema,
  ReactiveProps,
  RefsSchema,
} from "./types";

type StoreValues<Stores extends ReadableAtom<any>[]> = {
  [Index in keyof Stores]: StoreValue<Stores[Index]>;
};

export type SetupContext<Props extends PropsSchema, Refs extends RefsSchema> = Pick<
  UIComponent<Props, Refs>,
  | "host"
  | "refs"
  | "props"
  | "on"
  | "effect"
  | "emit"
  | "registerCleanup"
  | "consume"
  | "bind"
  | "render"
  | "renderList"
  | "getElement"
  | "getElements"
  | "withCache"
>;

export type SetupFn<Props extends PropsSchema, Refs extends RefsSchema> = (
  ctx: SetupContext<Props, Refs>,
) => Record<string, unknown> | void;

export type ComponentCtor<
  Name extends string,
  Props extends PropsSchema,
  Refs extends RefsSchema,
  Mixin = Record<string, never>,
> = (new () => UIComponent<Props, Refs> & ComponentProps<Props> & Mixin) & {
  readonly elementName: Name;
};

export abstract class UIComponent<
  Props extends PropsSchema,
  Refs extends RefsSchema,
> extends HTMLElement {
  #cache = new Map<string, unknown>();
  #cleanups: VoidFunction[] = [];

  abstract get refs(): InferRefs<Refs>;
  abstract get props(): ReactiveProps<Props>;
  abstract get host(): HTMLElement;

  /** Clears the element cache and runs all registered cleanup functions. */
  protected disconnectedCallback(): void {
    this.#cache.clear();
    for (const cleanup of this.#cleanups) cleanup();
    this.#cleanups = [];
  }

  /** Registers a cleanup function to be called when the component is disconnected. */
  registerCleanup(callback: VoidFunction): void {
    this.#cleanups.push(callback);
  }

  /**
   * Adds an event listener to one or more elements, Document, or Window and registers automatic cleanup on disconnect.
   */
  on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement[],
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (this: Document, ev: DocumentEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on(
    target: HTMLElement | HTMLElement[] | Document | Window,
    type: string,
    listener: (this: HTMLElement | Document | Window, ev: Event) => any,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const targets = Array.isArray(target) ? target : [target];
    for (const t of targets) {
      t.addEventListener(type, listener as EventListener, options);
      this.registerCleanup(() => t.removeEventListener(type, listener as EventListener, options));
    }
  }

  /**
   * Dispatches a bubbling, cancelable `CustomEvent` with the given name and optional detail.
   * Returns `false` if the event was cancelled via `preventDefault()`.
   */
  emit<T extends string, D>(eventName: T, detail?: D, options?: CustomEventInit): void {
    const event = new CustomEvent<D>(eventName, {
      bubbles: true,
      cancelable: true,
      ...options,
      detail,
    });
    this.dispatchEvent(event);
  }

  /**
   * Returns a cached value for `key`, computing and storing it on the first call.
   * Cache is cleared on disconnect.
   */
  withCache<T>(key: string, compute: () => T): T {
    if (this.#cache.has(key)) {
      const stored = this.#cache.get(key);
      invariant(stored, `${this.constructor.name}: missing cached value for key ${key}`);
      return stored as T;
    }
    const value = compute();
    this.#cache.set(key, value);
    return value;
  }

  /**
   * Queries a single required element by CSS selector. Throws if not found.
   * Results are cached per selector by default if custom `root` isn't specified or `cache: false` is not passed.
   */
  getElement<const E extends keyof HTMLElementTagNameMap>(
    selector: E | string,
    options?: { root?: DocumentFragment | HTMLElement; cache?: boolean },
  ): HTMLElementTagNameMap[E] {
    const opts = { root: this as HTMLElement, cache: true, ...options };
    const get = () => {
      const element = opts.root.querySelector<HTMLElementTagNameMap[E]>(selector);
      invariant(element, `${this.constructor.name}: missing ${selector} element`);
      return element;
    };
    const shouldCache = opts.cache && opts.root === this;
    if (!shouldCache) return get();
    return this.withCache<HTMLElementTagNameMap[E]>(`element:${selector}`, get);
  }

  /**
   * Queries all matching elements by CSS selector. Throws if none found.
   * Results are cached per selector by default if custom `root` isn't specified or `cache: false` is not passed.
   */
  getElements<E extends keyof HTMLElementTagNameMap>(
    selector: E | string,
    options?: { root?: DocumentFragment | HTMLElement; cache?: boolean },
  ): HTMLElementTagNameMap[E][] {
    const opts = { root: this as HTMLElement, cache: true, ...options };
    const get = () => {
      const elements = Array.from(opts.root.querySelectorAll<HTMLElementTagNameMap[E]>(selector));
      invariant(elements.length > 0, `${this.constructor.name}: missing ${selector} elements`);
      return elements;
    };
    const shouldCache = opts.cache && opts.root === this;
    if (!shouldCache) return get();
    return this.withCache<HTMLElementTagNameMap[E][]>(`elements:${selector}`, get);
  }

  /**
   * Finds the nearest ancestor component matching `ctor.elementName` and returns it as the typed component.
   * Throws if no matching ancestor exists. Useful for child components to consume context from parent components without explicit prop passing or global state.
   */
  consume<T extends HTMLElement>(ctor: (new () => T) & { elementName: string }): T {
    const closest = this.closest(ctor.elementName) as T | null;
    invariant(
      closest,
      `${this.constructor.name} component: no ancestor found for consumed component ${ctor.elementName}`,
    );
    return closest;
  }

  /**
   * Subscribes `callback` to one store or an array of stores and registers automatic cleanup
   * on disconnect. Immediately invokes the callback with the current value(s).
   */
  effect<T>(store: ReadableAtom<T>, callback: (value: T) => void): void;
  effect<Stores extends ReadableAtom<any>[]>(
    stores: [...Stores],
    callback: (...values: StoreValues<Stores>) => void,
  ): void;
  effect(storeOrStores: any, callback: any): void {
    this.registerCleanup(effect(storeOrStores, callback));
  }

  /**
   * Two-way binds an external `store` to a component prop.
   * Changes to `store` update the prop; changes to the prop update `store`.
   * Use `options.get` / `options.set` to transform values across the boundary.
   */
  bind<Prop extends keyof Props & string, Value>(
    prop: Prop,
    store: WritableAtom<Value>,
    options?: {
      get?: (value: Value) => Infer<Props[Prop]>;
      set?: (value: Infer<Props[Prop]>) => Value;
    },
  ): void {
    const propStore = this.props[`$${prop}`] as WritableAtom<Infer<Props[Prop]>>;
    this.effect(store, (value) => {
      propStore.set(options?.get ? options.get(value) : (value as unknown as Infer<Props[Prop]>));
    });
    this.effect(propStore, (value) => {
      store.set(options?.set ? options.set(value) : (value as unknown as Value));
    });
  }

  /**
   * Clones a `<template name="...">` inside this element and optionally fills it with `data`.
   * Returns the resulting `DocumentFragment`.
   */
  render<T>(
    name: string,
    data?: T,
    fill?: (template: DocumentFragment, data: T) => void,
  ): DocumentFragment {
    const template = this.getElement<"template">(`template[name="${name}"]`);
    const clone = template.content.cloneNode(true) as DocumentFragment;
    if (fill && data !== undefined) fill(clone, data);
    return clone;
  }

  /**
   * Renders `<template name="...">` for each item in `items`, filling each clone via `fill`.
   * Returns a single `DocumentFragment` containing all rendered items.
   */
  renderList<T>(
    name: string,
    items: T[],
    fill: (template: DocumentFragment, item: T, index: number) => void,
  ): DocumentFragment {
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const itemFragment = this.render(name, item, (clone, data) => fill(clone, data, index));
      fragment.append(itemFragment);
    });
    return fragment;
  }
}
