import type {
  MetadataTypeManager,
  MultitextPropertyWidgetComponent,
  PropertyWidget
} from '@obsidian-typings/obsidian-public-latest';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import {
  isComplexValue,
  isSimpleArray
} from '../value-utils.ts';

interface MetadataTypeManagerGetTypeInfoPatchComponentConstructorParams {
  readonly listWidget: PropertyWidget<MultitextPropertyWidgetComponent>;
  readonly metadataTypeManager: MetadataTypeManager;
  readonly mixedListWidget: PropertyWidget;
  readonly objectWidget: PropertyWidget;
}

export class MetadataTypeManagerGetTypeInfoPatchComponent extends MonkeyAroundComponent {
  private readonly listWidget: PropertyWidget<MultitextPropertyWidgetComponent>;
  private readonly metadataTypeManager: MetadataTypeManager;
  private readonly mixedListWidget: PropertyWidget;
  private readonly objectWidget: PropertyWidget;

  public constructor(params: MetadataTypeManagerGetTypeInfoPatchComponentConstructorParams) {
    super();
    this.metadataTypeManager = params.metadataTypeManager;
    this.listWidget = params.listWidget;
    this.mixedListWidget = params.mixedListWidget;
    this.objectWidget = params.objectWidget;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'getTypeInfo',
      obj: this.metadataTypeManager,
      patchHandler: ({
        fallback,
        originalArgs: [, value]
      }) => {
        const result = fallback();

        if (result.inferred.type === 'unknown' && isComplexValue(value)) {
          if (isSimpleArray(value)) {
            result.inferred = this.listWidget;
          } else if (Array.isArray(value)) {
            result.inferred = this.mixedListWidget;
          } else {
            result.inferred = this.objectWidget;
          }
          result.expected = result.inferred;
        }
        return result;
      }
    });
  }
}
