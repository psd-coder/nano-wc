import type { PropsSchema, RefsSchema } from "./types";
import type { ComponentCtor, SetupFn, SetupContext } from "./UIComponent";
import { propBuilders, refBuilders } from "./builders";
import { createComponent } from "./helpers";

export class ComponentBuilder<
  Name extends string,
  Props extends PropsSchema = Record<string, never>,
  Refs extends RefsSchema = Record<string, never>,
> {
  readonly name: Name;
  readonly propsSchema: Props;
  readonly refsSchema: Refs;

  constructor(name: Name, propsSchema: Props = {} as Props, refsSchema: Refs = {} as Refs) {
    this.name = name;
    this.propsSchema = propsSchema;
    this.refsSchema = refsSchema;
  }

  withProps<P extends PropsSchema>(
    factory: (builders: typeof propBuilders) => P,
  ): ComponentBuilder<Name, Props & P, Refs> {
    const newProps = factory(propBuilders);
    return new ComponentBuilder(
      this.name,
      { ...this.propsSchema, ...newProps } as Props & P,
      this.refsSchema,
    );
  }

  withRefs<R extends RefsSchema>(
    factory: (builders: typeof refBuilders) => R,
  ): ComponentBuilder<Name, Props, Refs & R> {
    const newRefs = factory(refBuilders);
    return new ComponentBuilder(this.name, this.propsSchema, {
      ...this.refsSchema,
      ...newRefs,
    } as Refs & R);
  }

  setup<M extends Record<string, unknown> = Record<string, never>>(
    setupFn: (ctx: SetupContext<Props, Refs>) => M | void,
  ): ComponentCtor<Name, Props, Refs, M> {
    return createComponent<Name, Props, Refs, M>(
      this.name,
      this.propsSchema,
      this.refsSchema,
      setupFn as SetupFn<Props, Refs>,
    );
  }
}

export function define<const Name extends string>(name: Name): ComponentBuilder<Name>;
export function define<
  const Name extends string,
  M extends Record<string, unknown> = Record<string, never>,
>(
  name: Name,
  setup: (ctx: SetupContext<Record<string, never>, Record<string, never>>) => M | void,
): ComponentCtor<Name, Record<string, never>, Record<string, never>, M>;
export function define<const Name extends string>(
  name: Name,
  setup?: SetupFn<Record<string, never>, Record<string, never>>,
) {
  if (setup) {
    return createComponent(name, {} as Record<string, never>, {} as Record<string, never>, setup);
  }
  return new ComponentBuilder(name);
}
