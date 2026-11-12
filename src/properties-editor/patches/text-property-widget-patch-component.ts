import type {
  PropertyRenderContext,
  PropertyWidget
} from '@obsidian-typings/obsidian-public-latest';

import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';

import { parseFlowCollectionValue } from '../../nested-values/flow-collection-value.ts';

interface TextPropertyWidgetPatchComponentConstructorParams {
  readonly isEnabled: (this: void) => boolean;
  readonly onValueConverted: (this: void, context: PropertyRenderContext, el: HTMLElement, convertedValue: unknown) => void;
  readonly textWidget: PropertyWidget;
}

/**
 * Turns a text property value typed as a YAML flow collection (`{ key: value }`, `[a, b]`, `[]`) into the
 * value it describes, as the value is committed (issue #15).
 *
 * Obsidian's text widget calls `onChange` only when its value is committed - on Enter or on blur - never on
 * each keystroke, so wrapping that callback converts every finished value exactly once and never parses a
 * half-typed one. Nested text entries render through the same widget, so this covers them too.
 */
export class TextPropertyWidgetPatchComponent extends MonkeyAroundComponent {
  private readonly isEnabled: (this: void) => boolean;
  private readonly onValueConverted: (this: void, context: PropertyRenderContext, el: HTMLElement, convertedValue: unknown) => void;
  private readonly textWidget: PropertyWidget;

  public constructor(params: TextPropertyWidgetPatchComponentConstructorParams) {
    super();
    this.isEnabled = params.isEnabled;
    this.onValueConverted = params.onValueConverted;
    this.textWidget = params.textWidget;
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: this.textWidget,
      methodName: 'render',
      patchHandler: ({
        originalArguments: [el, value, context],
        originalMethodBound
      }) =>
        originalMethodBound(el, value, {
          ...context,
          onChange: (newValue: unknown): void => {
            const convertedValue = this.isEnabled() && typeof newValue === 'string' ? parseFlowCollectionValue(newValue) : null;
            if (convertedValue === null) {
              context.onChange(newValue);
              return;
            }

            // Before the change, so the re-render it causes already sees what the callback recorded.
            this.onValueConverted(context, el, convertedValue);
            context.onChange(convertedValue);
          }
        })
    });
  }
}
