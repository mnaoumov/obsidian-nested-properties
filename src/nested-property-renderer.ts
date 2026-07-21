import type {
  MultitextPropertyWidgetComponent,
  PropertyRenderContext,
  PropertyWidget,
  PropertyWidgetComponentBase
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';
import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import {
  Component,
  MarkdownView,
  Menu,
  setIcon
} from 'obsidian';
import {
  convertAsyncToSync,
  invokeAsyncSafely
} from 'obsidian-dev-utils/async';
import { AllWindowsEventComponent } from 'obsidian-dev-utils/obsidian/components/all-windows-event-component';
import { getAllDomWindows } from 'obsidian-dev-utils/obsidian/workspace';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import { FloatingScrollbarComponent } from './floating-scrollbar.ts';
import { MetadataTypeManagerGetTypeInfoPatchComponent } from './patches/metadata-type-manager-get-type-info-patch-component.ts';
import { MultiTextPropertyWidgetPatchComponent } from './patches/multi-text-property-widget-patch-component.ts';
import { UnknownWidgetRenderPatchComponent } from './patches/unknown-widget-render-patch-component.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { TypeChangeModal } from './type-change-modal.ts';
import {
  convertValue,
  isComplexValue,
  isLossyConversion,
  isSimpleArray
} from './value-utils.ts';

const LIST_WIDGET_TYPE = 'list';
const OBJECT_WIDGET_TYPE = 'object';
const FULL_KEY_DISPLAY_BODY_CLASS = 'nested-properties-full-key-display';

interface CreateSummaryParams {
  readonly expandedPaths: Set<string>;
  readonly parentEl: HTMLElement;
  readonly path: string;
  readonly propertyEl: HTMLElement;
  readonly value: unknown;
}

interface InjectHeaderButtonsParams {
  readonly expandedPaths: Set<string>;
  readonly metadataContainerEl: HTMLElement;
  onToggleFullKeyDisplay(this: void): void;
}

interface NestedPropertyRendererComponentChangeTypeParams {
  onValueChange(this: void, newValue: unknown): void;
  readonly path: string;
  readonly value: unknown;
  readonly widget: PropertyWidget;
}

interface NestedPropertyRendererComponentConstructorParams {
  readonly app: App;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

interface NestedPropertyRendererComponentGetWidgetParams {
  readonly label: string;
  readonly path: string;
  readonly value: unknown;
}

interface NestedPropertyRendererComponentRenderArrayParams {
  readonly arr: unknown[];
  readonly containerEl: HTMLElement;
  readonly ctx: PropertyRenderContext;
  onArrayChange(this: void, newValue: unknown): void;
  readonly parentPath: string;
}

interface NestedPropertyRendererComponentRenderComplexWidgetParams {
  readonly ctx: PropertyRenderContext;
  readonly el: HTMLElement;
  readonly value: unknown;
  readonly widgetType: string;
}

interface NestedPropertyRendererComponentRenderEntryParams {
  readonly containerEl: HTMLElement;
  readonly ctx: PropertyRenderContext;
  readonly label: string;
  onDelete(this: void): void;
  onValueChange(this: void, newValue: unknown): void;
  readonly parentPath: string;
  readonly value: unknown;
}

interface NestedPropertyRendererComponentRenderKeyElParams {
  readonly label: string;
  onDelete(this: void): void;
  onValueChange(this: void, newValue: unknown): void;
  readonly parentEl: HTMLElement;
  readonly path: string;
  readonly value: unknown;
}

interface NestedPropertyRendererComponentRenderNestedValueParams {
  readonly containerEl: HTMLElement;
  readonly ctx: PropertyRenderContext;
  onValueChange(this: void, newValue: unknown): void;
  readonly path: string;
  readonly value: unknown;
}

interface NestedPropertyRendererComponentRenderObjectParams {
  readonly containerEl: HTMLElement;
  readonly ctx: PropertyRenderContext;
  readonly obj: GenericObject;
  onValueChange(this: void, newValue: unknown): void;
  readonly parentPath: string;
}

interface NestedPropertyRendererComponentShowNestedPropertyMenuParams {
  readonly evt: MouseEvent;
  readonly label: string;
  onDelete(this: void): void;
  onValueChange(this: void, newValue: unknown): void;
  readonly path: string;
  readonly value: unknown;
}

interface RenderAddItemButtonParams {
  readonly arr: unknown[];
  readonly containerEl: HTMLElement;
  onValueChange(this: void, newValue: unknown): void;
}

interface RenderAddPropertyButtonParams {
  readonly containerEl: HTMLElement;
  readonly obj: GenericObject;
  onValueChange(this: void, newValue: unknown): void;
  setPendingFocusKey(this: void, key: string): void;
}

interface UpdateToggleButtonParams {
  readonly metadataContainerEl: HTMLElement;
  readonly toggleButton: HTMLElement;
}

export class NestedPropertyRendererComponent extends Component {
  private _listWidget?: PropertyWidget<MultitextPropertyWidgetComponent>;
  private _mixedListWidget?: PropertyWidget;
  private _objectWidget?: PropertyWidget;
  private readonly app: App;
  private readonly expandedPaths = new Set<string>();
  private floatingScrollbar?: FloatingScrollbarComponent;
  private isFullKeyDisplayEnabled = false;
  private lastMenuCloseTime = 0;
  private pendingFocusKey: null | string = null;
  private readonly pluginSettingsComponent: PluginSettingsComponent;
  private readonly widgetTypeOverrides = new Map<string, string>();

  private get listWidget(): PropertyWidget<MultitextPropertyWidgetComponent> {
    return ensureNonNullable(this._listWidget);
  }

  private get mixedListWidget(): PropertyWidget {
    return ensureNonNullable(this._mixedListWidget);
  }

  private get objectWidget(): PropertyWidget {
    return ensureNonNullable(this._objectWidget);
  }

  public constructor(params: NestedPropertyRendererComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override onload(): void {
    super.onload();
    this._mixedListWidget = {
      icon: 'lucide-list-tree',
      name: (): string => 'Mixed list',
      render: (el, value, ctx): PropertyWidgetComponentBase => this.renderComplexWidget({ ctx, el, value, widgetType: LIST_WIDGET_TYPE }),
      type: LIST_WIDGET_TYPE,
      validate: (value): boolean => Array.isArray(value)
    };

    this._objectWidget = {
      icon: 'lucide-braces',
      name: (): string => 'Object',
      render: (el, value, ctx): PropertyWidgetComponentBase => this.renderComplexWidget({ ctx, el, value, widgetType: OBJECT_WIDGET_TYPE }),
      type: OBJECT_WIDGET_TYPE,
      validate: (value): boolean => value !== null && typeof value === 'object' && !Array.isArray(value)
    };

    this.app.metadataTypeManager.registeredTypeWidgets[LIST_WIDGET_TYPE] = this.mixedListWidget;
    this.app.metadataTypeManager.registeredTypeWidgets[OBJECT_WIDGET_TYPE] = this.objectWidget;
    this._listWidget = this.app.metadataTypeManager.registeredTypeWidgets.multitext;

    this.addChild(new MultiTextPropertyWidgetPatchComponent(this.listWidget));
    this.addChild(
      new MetadataTypeManagerGetTypeInfoPatchComponent({
        listWidget: this.listWidget,
        metadataTypeManager: this.app.metadataTypeManager,
        mixedListWidget: this.mixedListWidget,
        objectWidget: this.objectWidget
      })
    );

    const unknownWidget = this.app.metadataTypeManager.getWidget('unknown');

    this.addChild(
      new UnknownWidgetRenderPatchComponent({
        listWidget: this.listWidget,
        mixedListWidget: this.mixedListWidget,
        objectWidget: this.objectWidget,
        unknownWidget
      })
    );

    this.register(() => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Unregister widget on unload.
      delete this.app.metadataTypeManager.registeredTypeWidgets[LIST_WIDGET_TYPE];
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Unregister widget on unload.
      delete this.app.metadataTypeManager.registeredTypeWidgets[OBJECT_WIDGET_TYPE];
      for (const el of activeDocument.querySelectorAll('.nested-properties-header-actions')) {
        el.remove();
      }
      for (const win of getAllDomWindows(this.app)) {
        win.document.body.removeClass(FULL_KEY_DISPLAY_BODY_CLASS);
      }
      this.reloadAllProperties();
    });

    this.isFullKeyDisplayEnabled = this.pluginSettingsComponent.settings.isFullKeyDisplayEnabled;

    const allWindowsEventComponent = this.addChild(new AllWindowsEventComponent(this.app));
    allWindowsEventComponent.registerAllWindowsHandler((win) => {
      this.applyFullKeyDisplayClass(win);
    });

    this.floatingScrollbar = this.addChild(new FloatingScrollbarComponent(this.app));
    this.reloadAllProperties();
  }

  public toggleFullKeyDisplay(): void {
    this.isFullKeyDisplayEnabled = !this.isFullKeyDisplayEnabled;
    for (const win of getAllDomWindows(this.app)) {
      this.applyFullKeyDisplayClass(win);
    }
    invokeAsyncSafely(() =>
      this.pluginSettingsComponent.editAndSave((settings) => {
        settings.isFullKeyDisplayEnabled = this.isFullKeyDisplayEnabled;
      })
    );
  }

  private applyFullKeyDisplayClass(win: Window): void {
    win.document.body.toggleClass(FULL_KEY_DISPLAY_BODY_CLASS, this.isFullKeyDisplayEnabled);
  }

  private async changeType(params: NestedPropertyRendererComponentChangeTypeParams): Promise<void> {
    const { onValueChange, path, value, widget } = params;
    if (isLossyConversion({ targetType: widget.type, value })) {
      const modal = new TypeChangeModal(this.app, widget.name());
      modal.open();
      if (!await modal.waitForResult()) {
        return;
      }
    }

    if (activeDocument.activeElement instanceof HTMLElement) {
      activeDocument.activeElement.blur();
    }

    this.widgetTypeOverrides.set(path, widget.type);

    const converted = convertValue({ targetType: widget.type, value });
    if (converted === value) {
      this.reloadAllProperties();
    } else {
      onValueChange(converted);
    }
  }

  private getWidget(params: NestedPropertyRendererComponentGetWidgetParams): PropertyWidget {
    const { label, path, value } = params;
    const override = this.widgetTypeOverrides.get(path);
    if (override) {
      const widget = this.app.metadataTypeManager.registeredTypeWidgets[override];
      if (widget) {
        return widget;
      }
    }
    return this.app.metadataTypeManager.getTypeInfo(label, value).inferred;
  }

  private reloadAllProperties(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView) {
        const data = leaf.view.metadataEditor.serialize();
        leaf.view.metadataEditor.synchronize({});
        leaf.view.metadataEditor.synchronize(data);
      }
    }
  }

  private renderArray(params: NestedPropertyRendererComponentRenderArrayParams): void {
    const { arr, containerEl, ctx, onArrayChange, parentPath } = params;
    for (const [index, item] of arr.entries()) {
      this.renderEntry({
        containerEl,
        ctx,
        label: String(index),
        onDelete: () => {
          const newArr = arr.filter((_, i) => i !== index);
          onArrayChange(newArr);
        },
        onValueChange: (newValue: unknown) => {
          const newArr = [...arr];
          newArr[index] = newValue;
          onArrayChange(newArr);
        },
        parentPath,
        value: item
      });
    }
    renderAddItemButton({ arr, containerEl, onValueChange: onArrayChange });
  }

  private renderComplexWidget(params: NestedPropertyRendererComponentRenderComplexWidgetParams): PropertyWidgetComponentBase {
    const { ctx, el, widgetType } = params;
    let value = params.value;
    if (widgetType === LIST_WIDGET_TYPE && !Array.isArray(value)) {
      value = [];
    } else if (widgetType === OBJECT_WIDGET_TYPE && (!isComplexValue(value) || Array.isArray(value))) {
      value = {};
    }

    const rootPath = `${ctx.sourcePath}:${ctx.key}`;

    const propertyEl = el.closest('.metadata-property');
    if (propertyEl instanceof HTMLElement) {
      const isExpanded = this.expandedPaths.has(rootPath);
      propertyEl.classList.add('nested-properties-collapsible');
      propertyEl.setAttribute('data-path', rootPath);
      if (!isExpanded) {
        propertyEl.classList.add('is-collapsed');
      }

      const existingIcon = propertyEl.querySelector('.metadata-property-key .metadata-property-icon');
      if (existingIcon instanceof HTMLElement) {
        setIcon(existingIcon, widgetType === LIST_WIDGET_TYPE ? 'lucide-list-tree' : 'lucide-braces');
      }

      const keyEl = propertyEl.querySelector('.metadata-property-key');
      if (keyEl && !keyEl.querySelector('.nested-properties-collapse-btn')) {
        const collapseBtn = createDiv('nested-properties-collapse-btn');
        setIcon(collapseBtn, 'right-triangle');
        keyEl.insertBefore(collapseBtn, keyEl.firstChild);
        collapseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const collapsed = propertyEl.hasClass('is-collapsed');
          propertyEl.toggleClass('is-collapsed', !collapsed);
          if (collapsed) {
            this.expandedPaths.add(rootPath);
          } else {
            this.expandedPaths.delete(rootPath);
          }
          this.floatingScrollbar?.update();
        });
      }

      // Size the native key input to its content so the full-key-display toggle (`width: auto`) can
      // Expand it. Obsidian's default input width overrides `size` while the toggle is off, so this is
      // Inert until the body class is present — mirroring the nested inputs in `renderKeyEl`.
      const keyInputEl = keyEl?.querySelector('.metadata-property-key-input');
      if (keyInputEl instanceof HTMLInputElement) {
        keyInputEl.size = Math.max(1, keyInputEl.value.length);
      }
    }

    if (propertyEl instanceof HTMLElement) {
      createSummary({ expandedPaths: this.expandedPaths, parentEl: el, path: rootPath, propertyEl, value });
    }

    const containerEl = el.createDiv({ cls: 'nested-properties-container' });
    this.renderNestedValue({
      containerEl,
      ctx,
      onValueChange: (newValue: unknown) => {
        ctx.onChange(newValue);
      },
      path: rootPath,
      value
    });

    window.setTimeout(() => {
      const metadataContainerEl = containerEl.closest('.metadata-container');
      if (metadataContainerEl instanceof HTMLElement) {
        injectHeaderButtons({
          expandedPaths: this.expandedPaths,
          metadataContainerEl,
          onToggleFullKeyDisplay: () => {
            this.toggleFullKeyDisplay();
          }
        });
        sizeTopLevelKeyInputs(metadataContainerEl);
      }

      if (this.pendingFocusKey) {
        const key = this.pendingFocusKey;
        this.pendingFocusKey = null;
        for (const input of containerEl.querySelectorAll('.metadata-property-key-input')) {
          if (input.instanceOf(HTMLInputElement) && input.value === key) {
            const prop = input.closest('.metadata-property');
            const valueEl = prop?.querySelector(':scope > .metadata-property-value');
            if (valueEl instanceof HTMLElement) {
              const focusTargetEl = valueEl.querySelector('input, textarea, [contenteditable]');
              if (focusTargetEl instanceof HTMLElement) {
                focusTargetEl.focus();
              } else {
                valueEl.click();
              }
            }
            break;
          }
        }
      }
      this.floatingScrollbar?.update();
    }, 0);

    return {
      focus: (): void => {
        containerEl.focus();
      },
      type: widgetType
    };
  }

  private renderEntry(params: NestedPropertyRendererComponentRenderEntryParams): void {
    const { containerEl, ctx, label, onDelete, onValueChange, parentPath, value } = params;
    const path = `${parentPath}.${label}`;
    const typeOverride = this.widgetTypeOverrides.get(path);
    const isComplex = typeOverride === LIST_WIDGET_TYPE || typeOverride === OBJECT_WIDGET_TYPE
      || (isComplexValue(value) && !isSimpleArray(value));

    if (isComplex) {
      const isExpanded = this.expandedPaths.has(path);
      const propertyEl = containerEl.createDiv({
        attr: { 'data-path': path },
        cls: ['metadata-property', 'nested-properties-collapsible', ...(isExpanded ? [] : ['is-collapsed'])]
      });
      propertyEl.addEventListener('contextmenu', (e) => {
        e.stopPropagation();
        this.showNestedPropertyMenu({ evt: e, label, onDelete, onValueChange, path, value });
      });

      const keyEl = propertyEl.createDiv({ cls: 'metadata-property-key' });

      const collapseBtn = keyEl.createDiv({ cls: 'nested-properties-collapse-btn' });
      setIcon(collapseBtn, 'right-triangle');
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const collapsed = propertyEl.hasClass('is-collapsed');
        propertyEl.toggleClass('is-collapsed', !collapsed);
        if (collapsed) {
          this.expandedPaths.add(path);
        } else {
          this.expandedPaths.delete(path);
        }
      });

      const complexWidget = this.getWidget({ label, path, value });
      const iconEl = keyEl.createSpan({ cls: 'metadata-property-icon' });
      setIcon(iconEl, complexWidget.icon);
      iconEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showNestedPropertyMenu({ evt: e, label, onDelete, onValueChange, path, value });
      });
      const keyInput = keyEl.createEl('input', {
        attr: { readonly: '', tabindex: '-1' },
        cls: 'metadata-property-key-input',
        value: label
      });
      keyInput.size = Math.max(1, label.length);

      const valueEl = propertyEl.createDiv({ cls: 'metadata-property-value' });
      createSummary({ expandedPaths: this.expandedPaths, parentEl: valueEl, path, propertyEl, value });
      const nestedContainer = valueEl.createDiv({ cls: 'nested-properties-container' });
      this.renderNestedValue({ containerEl: nestedContainer, ctx, onValueChange, path, value });
      return;
    }
    const propertyEl = containerEl.createDiv({ cls: 'metadata-property' });
    propertyEl.addEventListener('contextmenu', (e) => {
      e.stopPropagation();
      this.showNestedPropertyMenu({ evt: e, label, onDelete, onValueChange, path, value });
    });
    this.renderKeyEl({ label, onDelete, onValueChange, parentEl: propertyEl, path, value });

    const widget = this.getWidget({ label, path, value });
    const valueEl = propertyEl.createDiv({ cls: 'metadata-property-value' });
    valueEl.setAttr('data-property-type', widget.type);
    widget.render(valueEl, value, {
      app: ctx.app,
      blur: ctx.blur.bind(ctx),
      key: label,
      onChange: onValueChange,
      sourcePath: ctx.sourcePath
    });
  }

  private renderKeyEl(params: NestedPropertyRendererComponentRenderKeyElParams): void {
    const { label, onDelete, onValueChange, parentEl, path, value } = params;
    const keyEl = parentEl.createDiv({ cls: 'metadata-property-key' });

    const widget = this.getWidget({ label, path, value });
    const iconEl = keyEl.createSpan({ cls: 'metadata-property-icon' });
    setIcon(iconEl, widget.icon);
    iconEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showNestedPropertyMenu({ evt: e, label, onDelete, onValueChange, path, value });
    });

    const keyInput = keyEl.createEl('input', {
      attr: { readonly: '', tabindex: '-1' },
      cls: 'metadata-property-key-input',
      value: label
    });
    keyInput.size = Math.max(1, label.length);
  }

  private renderNestedValue(params: NestedPropertyRendererComponentRenderNestedValueParams): void {
    const { containerEl, ctx, onValueChange, path, value } = params;
    if (Array.isArray(value)) {
      this.renderArray({ arr: value, containerEl, ctx, onArrayChange: onValueChange, parentPath: path });
    } else {
      this.renderObject({ containerEl, ctx, obj: value as GenericObject, onValueChange, parentPath: path });
    }
  }

  private renderObject(params: NestedPropertyRendererComponentRenderObjectParams): void {
    const { containerEl, ctx, obj, onValueChange, parentPath } = params;
    for (const [key, val] of Object.entries(obj)) {
      this.renderEntry({
        containerEl,
        ctx,
        label: key,
        onDelete: () => {
          const newObj = { ...obj };
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Need to delete the key.
          delete newObj[key];
          onValueChange(newObj);
        },
        onValueChange: (newValue: unknown) => {
          const newObj = { ...obj, [key]: newValue };
          onValueChange(newObj);
        },
        parentPath,
        value: val
      });
    }
    renderAddPropertyButton({
      containerEl,
      obj,
      onValueChange,
      setPendingFocusKey: (key) => {
        this.pendingFocusKey = key;
      }
    });
  }

  private showNestedPropertyMenu(params: NestedPropertyRendererComponentShowNestedPropertyMenuParams): void {
    const { evt, label, onDelete, onValueChange, path, value } = params;
    const MENU_DELAY_IN_MILLISECONDS = 200;
    if (Date.now() - this.lastMenuCloseTime < MENU_DELAY_IN_MILLISECONDS) {
      return;
    }
    const menu = new Menu();
    menu.onHide(() => {
      this.lastMenuCloseTime = Date.now();
    });
    menu.addSections(['type', 'action', '', 'danger']);
    menu.addItem((item) => {
      item.setTitle('Property type')
        .setIcon('lucide-info')
        .setSection('type');
      const submenu = item.setSubmenu();
      const currentWidget = this.getWidget({ label, path, value });
      for (const widget of Object.values(this.app.metadataTypeManager.registeredTypeWidgets)) {
        if (widget.reservedKeys && !widget.reservedKeys.contains(label)) {
          continue;
        }
        submenu.addItem((subItem) => {
          subItem.setTitle(widget.name())
            .setIcon(widget.icon)
            .setChecked(widget.type === currentWidget.type)
            .onClick(convertAsyncToSync(async () => {
              await this.changeType({ onValueChange, path, value, widget });
            }));
        });
      }
    });
    menu.addItem((item) => {
      item.setTitle('Cut')
        .setIcon('lucide-scissors')
        .setSection('action')
        .onClick(convertAsyncToSync(async () => {
          // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
          await navigator.clipboard.writeText(JSON.stringify({ [label]: value }));
          onDelete();
        }));
    });
    menu.addItem((item) => {
      item.setTitle('Copy')
        .setIcon('lucide-copy')
        .setSection('action')
        .onClick(convertAsyncToSync(async () => {
          // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
          await navigator.clipboard.writeText(JSON.stringify({ [label]: value }));
        }));
    });
    menu.addItem((item) => {
      item.setTitle('Paste')
        .setIcon('lucide-clipboard-paste')
        .setSection('action')
        .onClick(convertAsyncToSync(async () => {
          try {
            // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
            const text = await navigator.clipboard.readText();
            const parsed = JSON.parse(text);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const firstValue = Object.values(parsed as GenericObject)[0];
              if (firstValue !== undefined) {
                onValueChange(firstValue);
              }
            }
          } catch (e) {
            console.error(e);
          }
        }));
    });
    menu.addItem((item) => {
      item.dom.addClass('is-warning');
      item.setTitle('Remove')
        .setIcon('lucide-trash-2')
        .setSection('danger')
        .onClick(onDelete);
    });
    menu.showAtMouseEvent(evt);
  }
}

function collapseAllIn(parentNode: ParentNode, expandedPaths: Set<string>): void {
  for (const el of parentNode.querySelectorAll('.nested-properties-collapsible')) {
    el.classList.add('is-collapsed');
    const path = el.getAttribute('data-path');
    if (path) {
      expandedPaths.delete(path);
    }
  }
}

function createSummary(params: CreateSummaryParams): void {
  const { expandedPaths, parentEl, path, propertyEl, value } = params;
  const summary = parentEl.createSpan({ cls: 'nested-properties-summary', text: Array.isArray(value) ? '[ ... ]' : '{ ... }' });
  summary.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    propertyEl.classList.remove('is-collapsed');
    expandedPaths.add(path);
  });
}

function expandAllIn(parentNode: ParentNode, expandedPaths: Set<string>): void {
  for (const el of parentNode.querySelectorAll('.nested-properties-collapsible')) {
    el.classList.remove('is-collapsed');
    const path = el.getAttribute('data-path');
    if (path) {
      expandedPaths.add(path);
    }
  }
}

function injectHeaderButtons(params: InjectHeaderButtonsParams): void {
  const { expandedPaths, metadataContainerEl, onToggleFullKeyDisplay } = params;
  if (metadataContainerEl.querySelector('.nested-properties-header-actions')) {
    return;
  }

  if (!metadataContainerEl.querySelector('.nested-properties-collapsible')) {
    return;
  }

  const headingEl = metadataContainerEl.querySelector('.metadata-properties-heading');
  if (!headingEl) {
    return;
  }

  const actionsEl = metadataContainerEl.createDiv({ cls: 'nested-properties-header-actions' });
  headingEl.after(actionsEl);

  const toggleButton = actionsEl.createDiv({ cls: 'clickable-icon' });
  updateToggleButton({ metadataContainerEl, toggleButton });

  toggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const allCollapsibles = metadataContainerEl.querySelectorAll('.nested-properties-collapsible');
    const allCollapsed = allCollapsibles.length > 0 && Array.from(allCollapsibles).every((el) => el.classList.contains('is-collapsed'));
    if (allCollapsed) {
      expandAllIn(metadataContainerEl, expandedPaths);
    } else {
      collapseAllIn(metadataContainerEl, expandedPaths);
    }
    updateToggleButton({ metadataContainerEl, toggleButton });
  });

  const fullKeyToggleButton = actionsEl.createDiv({ cls: 'clickable-icon nested-properties-full-key-toggle' });
  setIcon(fullKeyToggleButton, 'lucide-wrap-text');
  fullKeyToggleButton.setAttribute('aria-label', 'Toggle full key display');
  fullKeyToggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onToggleFullKeyDisplay();
  });
}

function renderAddItemButton(params: RenderAddItemButtonParams): void {
  const { arr, containerEl, onValueChange } = params;
  const addItemButton = containerEl.createDiv({ cls: 'nested-properties-add-item' });
  setIcon(addItemButton, 'plus');
  addItemButton.createSpan({ text: 'Add item' });
  addItemButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onValueChange([...arr, '']);
  });
}

function renderAddPropertyButton(params: RenderAddPropertyButtonParams): void {
  const { containerEl, obj, onValueChange, setPendingFocusKey } = params;
  const addPropertyButton = containerEl.createDiv({ cls: 'nested-properties-add-property' });
  setIcon(addPropertyButton, 'plus');
  addPropertyButton.createSpan({ text: 'Add property' });
  addPropertyButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    addPropertyButton.empty();
    const input = addPropertyButton.createEl('input', {
      attr: { placeholder: 'Property name', type: 'text' },
      cls: 'nested-properties-add-property-input'
    });
    input.focus();

    function restoreButton(): void {
      addPropertyButton.empty();
      setIcon(addPropertyButton, 'plus');
      addPropertyButton.createSpan({ text: 'Add property' });
    }

    function addKey(focusValue: boolean): void {
      const key = input.value.trim();
      if (key && !(key in obj)) {
        if (focusValue) {
          setPendingFocusKey(key);
        }
        onValueChange({ ...obj, [key]: '' });
      } else {
        restoreButton();
      }
    }

    input.addEventListener('keydown', (ke) => {
      ke.stopPropagation();
      if (ke.key === 'Enter' || ke.key === 'Tab') {
        ke.preventDefault();
        try {
          input.remove();
        } catch {
          /* Already removed by blur */
        }
        addKey(ke.key === 'Tab');
        return;
      }
      if (ke.key === 'Escape') {
        ke.preventDefault();
        restoreButton();
      }
    });
    input.addEventListener('blur', () => {
      if (input.isConnected) {
        addKey(false);
      }
    });
  });
}

function sizeTopLevelKeyInputs(metadataContainerEl: HTMLElement): void {
  // Size the native key input of every top-level property to its content so the full-key-display
  // Toggle (`width: auto`) can expand it. Obsidian renders plain scalar properties itself, so unlike
  // The object/list keys and nested keys the plugin never set their `size` - without this they stay
  // Truncated even when full key display is on. The `size` is inert while the toggle is off, because
  // Obsidian's default input width overrides it until the body class switches to `width: auto`.
  for (const input of metadataContainerEl.querySelectorAll('.metadata-property-key-input')) {
    if (input.instanceOf(HTMLInputElement) && !input.closest('.nested-properties-container')) {
      input.size = Math.max(1, input.value.length);
    }
  }
}

function updateToggleButton(params: UpdateToggleButtonParams): void {
  const { metadataContainerEl, toggleButton } = params;
  const allCollapsibles = metadataContainerEl.querySelectorAll('.nested-properties-collapsible');
  const allCollapsed = allCollapsibles.length > 0 && Array.from(allCollapsibles).every((el) => el.classList.contains('is-collapsed'));

  toggleButton.setAttribute('aria-label', allCollapsed ? 'Expand all nested properties' : 'Collapse all nested properties');
  toggleButton.empty();
  setIcon(toggleButton, allCollapsed ? 'chevrons-up-down' : 'chevrons-down-up');
}
