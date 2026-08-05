import type {
  MultitextPropertyWidgetComponent,
  PropertyWidget
} from '@obsidian-typings/obsidian-public-latest';

import { setIcon } from 'obsidian';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import {
  isComplexValue,
  isSimpleArray
} from '../value-utils.ts';

interface UnknownWidgetRenderPatchComponentConstructorParams {
  readonly listWidget: PropertyWidget<MultitextPropertyWidgetComponent>;
  readonly mixedListWidget: PropertyWidget;
  readonly objectWidget: PropertyWidget;
  readonly unknownWidget: PropertyWidget;
}

export class UnknownWidgetRenderPatchComponent extends MonkeyAroundComponent {
  private readonly listWidget: PropertyWidget<MultitextPropertyWidgetComponent>;
  private readonly mixedListWidget: PropertyWidget;
  private readonly objectWidget: PropertyWidget;
  private readonly unknownWidget: PropertyWidget;

  public constructor(params: UnknownWidgetRenderPatchComponentConstructorParams) {
    super();
    this.unknownWidget = params.unknownWidget;
    this.listWidget = params.listWidget;
    this.mixedListWidget = params.mixedListWidget;
    this.objectWidget = params.objectWidget;
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: this.unknownWidget,
      methodName: 'render',
      patchHandler: ({
        fallback,
        originalArguments: [el, value, context]
      }) => {
        if (isSimpleArray(value)) {
          const iconEl = el.closest('.metadata-property')?.querySelector(':scope .metadata-property-key .metadata-property-icon');
          if (iconEl instanceof HTMLElement) {
            setIcon(iconEl, this.listWidget.icon);
          }
          return this.listWidget.render(el, value, context);
        }
        if (Array.isArray(value)) {
          return this.mixedListWidget.render(el, value, context);
        }
        if (isComplexValue(value)) {
          return this.objectWidget.render(el, value, context);
        }
        return fallback();
      }
    });
  }
}
