import type {
  MultitextPropertyWidgetComponent,
  PropertyWidget
} from '@obsidian-typings/obsidian-public-latest';

import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';

import { isSimpleArray } from '../../nested-values/value-utils.ts';

export class MultiTextPropertyWidgetPatchComponent extends MonkeyAroundComponent {
  public constructor(private readonly multiTextPropertyWidget: PropertyWidget<MultitextPropertyWidgetComponent>) {
    super();
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: this.multiTextPropertyWidget,
      methodName: 'validate',
      patchHandler: ({
        fallback,
        originalArguments: [value]
      }) => {
        return fallback() || isSimpleArray(value);
      }
    });
  }
}
