import type { App } from 'obsidian';
import type { GenericObject } from 'obsidian-dev-utils/type-guards';
import type {
  MetadataTypeManager,
  PropertyRenderContext,
  PropertyWidget,
  PropertyWidgetComponentBase,
  TypeInfo
} from 'obsidian-typings';

import {
  Component,
  MarkdownView,
  Menu,
  setIcon
} from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { registerPatch } from 'obsidian-dev-utils/obsidian/monkey-around';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import { FloatingScrollbar } from './floating-scrollbar.ts';
import { TypeChangeModal } from './type-change-modal.ts';
import {
  convertValue,
  isComplexValue,
  isSimpleArray
} from './value-utils.ts';

const OBJECT_WIDGET_TYPE = 'object';

type GetTypeInfoFn = MetadataTypeManager['getTypeInfo'];
type UnknownRenderFn = (el: HTMLElement, value: unknown, ctx: PropertyRenderContext) => PropertyWidgetComponentBase;

export class NestedPropertyRenderer extends Component {
  private _listWidget: null | PropertyWidget = null;
  private _objectWidget: null | PropertyWidget = null;
  private readonly expandedPaths = new Set<string>();
  private floatingScrollbar: FloatingScrollbar | null = null;
  private lastMenuCloseTime = 0;
  private pendingFocusKey: null | string = null;

  private get listWidget(): PropertyWidget {
    return ensureNonNullable(this._listWidget);
  }

  private get objectWidget(): PropertyWidget {
    return ensureNonNullable(this._objectWidget);
  }

  public constructor(private readonly app: App) {
    super();
  }

  public override onload(): void {
    this._objectWidget = {
      icon: 'lucide-braces',
      name: (): string => 'Object',
      render: (el, value, ctx): PropertyWidgetComponentBase => this.renderObjectWidget(el, value, ctx),
      type: OBJECT_WIDGET_TYPE,
      validate: (value): boolean => value !== null && typeof value === 'object'
    };

    this.app.metadataTypeManager.registeredTypeWidgets[OBJECT_WIDGET_TYPE] = this.objectWidget;
    this._listWidget = this.app.metadataTypeManager.registeredTypeWidgets.multitext;

    registerPatch(this, this.app.metadataTypeManager, {
      getTypeInfo: (next: GetTypeInfoFn) => {
        return (property: string, value: unknown): TypeInfo => {
          return this.getTypeInfo(next, property, value);
        };
      }
    });

    const unknownWidget = this.app.metadataTypeManager.getWidget('unknown');
    registerPatch(this, unknownWidget, {
      render: (next: UnknownRenderFn): UnknownRenderFn => (el, value, ctx) => {
        return this.renderUnknownWidget(next, el, value, ctx);
      }
    });

    this.register(() => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Unregister widget on unload.
      delete this.app.metadataTypeManager.registeredTypeWidgets[OBJECT_WIDGET_TYPE];
      for (const el of document.querySelectorAll('.nested-properties-header-actions')) {
        el.remove();
      }
      this.reloadAllProperties();
    });

    this.floatingScrollbar = this.addChild(new FloatingScrollbar(this.app));
    this.reloadAllProperties();
  }

  public reloadAllProperties(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView) {
        const data = leaf.view.metadataEditor.serialize();
        leaf.view.metadataEditor.synchronize({});
        leaf.view.metadataEditor.synchronize(data);
      }
    }
  }

  private async changeType(widget: PropertyWidget, value: unknown, onValueChange: (newValue: unknown) => void): Promise<void> {
    if (!widget.validate(value)) {
      const modal = new TypeChangeModal(this.app, widget.name());
      modal.open();
      if (!await modal.waitForResult()) {
        return;
      }
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const converted = convertValue(value, widget.type);
    if (converted === value) {
      this.reloadAllProperties();
    } else {
      onValueChange(converted);
    }
  }

  private getTypeInfo(next: GetTypeInfoFn, property: string, value: unknown): TypeInfo {
    const result = next.call(this.app.metadataTypeManager, property, value);

    if (result.inferred.type === 'unknown' && isComplexValue(value)) {
      result.inferred = isSimpleArray(value) ? this.listWidget : this.objectWidget;
      result.expected = Array.isArray(value) ? this.listWidget : this.objectWidget;
    }
    return result;
  }

  private getWidget(label: string, value: unknown): PropertyWidget {
    return this.app.metadataTypeManager.getTypeInfo(label, value).inferred;
  }

  private renderArray(
    containerEl: HTMLElement,
    arr: unknown[],
    ctx: PropertyRenderContext,
    parentPath: string,
    onArrayChange: (newValue: unknown) => void
  ): void {
    for (const [index, item] of arr.entries()) {
      this.renderEntry(containerEl, String(index), item, ctx, parentPath, (newValue: unknown) => {
        const newArr = [...arr];
        newArr[index] = newValue;
        onArrayChange(newArr);
      }, () => {
        const newArr = arr.filter((_, i) => i !== index);
        onArrayChange(newArr);
      });
    }
    renderAddItemButton(containerEl, arr, onArrayChange);
  }

  private renderEntry(
    containerEl: HTMLElement,
    label: string,
    value: unknown,
    ctx: PropertyRenderContext,
    parentPath: string,
    onValueChange: (newValue: unknown) => void,
    onDelete: () => void
  ): void {
    const path = parentPath ? `${parentPath}.${label}` : label;

    if (isComplexValue(value)) {
      const isExpanded = this.expandedPaths.has(path);
      const propertyEl = containerEl.createDiv({
        attr: { 'data-path': path },
        cls: ['metadata-property', 'nested-properties-collapsible', ...(isExpanded ? [] : ['is-collapsed'])]
      });
      propertyEl.addEventListener('contextmenu', (e) => {
        e.stopPropagation();
        this.showNestedPropertyMenu(e, label, value, onValueChange, onDelete);
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

      const complexWidget = this.getWidget(label, value);
      const iconEl = keyEl.createSpan({ cls: 'metadata-property-icon' });
      setIcon(iconEl, complexWidget.icon);
      iconEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showNestedPropertyMenu(e, label, value, onValueChange, onDelete);
      });
      const keyInput = keyEl.createEl('input', {
        attr: { readonly: '', tabindex: '-1' },
        cls: 'metadata-property-key-input',
        value: label
      });
      keyInput.size = Math.max(1, label.length);

      const valueEl = propertyEl.createDiv({ cls: 'metadata-property-value' });
      createSummary(valueEl, value, propertyEl, path, this.expandedPaths);
      const nestedContainer = valueEl.createDiv({ cls: 'nested-properties-container' });
      this.renderNestedValue(nestedContainer, value, ctx, path, onValueChange);
      return;
    }
    const propertyEl = containerEl.createDiv({ cls: 'metadata-property' });
    propertyEl.addEventListener('contextmenu', (e) => {
      e.stopPropagation();
      this.showNestedPropertyMenu(e, label, value, onValueChange, onDelete);
    });
    this.renderKeyEl(propertyEl, label, value, onValueChange, onDelete);

    const widget = this.getWidget(label, value);
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

  private renderKeyEl(
    parentEl: HTMLElement,
    label: string,
    value: unknown,
    onValueChange?: (newValue: unknown) => void,
    onDelete?: () => void
  ): void {
    const keyEl = parentEl.createDiv({ cls: 'metadata-property-key' });

    const widget = this.getWidget(label, value);
    const iconEl = keyEl.createSpan({ cls: 'metadata-property-icon' });
    setIcon(iconEl, widget.icon);
    if (onValueChange && onDelete) {
      iconEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showNestedPropertyMenu(e, label, value, onValueChange, onDelete);
      });
    }

    const keyInput = keyEl.createEl('input', {
      attr: { readonly: '', tabindex: '-1' },
      cls: 'metadata-property-key-input',
      value: label
    });
    keyInput.size = Math.max(1, label.length);
  }

  private renderNestedValue(
    containerEl: HTMLElement,
    value: unknown,
    ctx: PropertyRenderContext,
    path: string,
    onValueChange: (newValue: unknown) => void
  ): void {
    if (Array.isArray(value)) {
      this.renderArray(containerEl, value, ctx, path, onValueChange);
    } else {
      this.renderObject(containerEl, value as GenericObject, ctx, path, onValueChange);
    }
  }

  private renderObject(
    containerEl: HTMLElement,
    obj: GenericObject,
    ctx: PropertyRenderContext,
    parentPath: string,
    onValueChange: (newValue: unknown) => void
  ): void {
    for (const [key, val] of Object.entries(obj)) {
      this.renderEntry(containerEl, key, val, ctx, parentPath, (newValue: unknown) => {
        const newObj = { ...obj, [key]: newValue };
        onValueChange(newObj);
      }, () => {
        const newObj = { ...obj };
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Need to delete the key.
        delete newObj[key];
        onValueChange(newObj);
      });
    }
    renderAddPropertyButton(containerEl, obj, onValueChange, (key) => {
      this.pendingFocusKey = key;
    });
  }

  private renderObjectWidget(el: HTMLElement, value: unknown, ctx: PropertyRenderContext): PropertyWidgetComponentBase {
    if (!isComplexValue(value)) {
      value = {};
      ctx.onChange(value);
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
        setIcon(existingIcon, Array.isArray(value) ? 'lucide-list' : 'lucide-braces');
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
    }

    if (propertyEl instanceof HTMLElement) {
      createSummary(el, value, propertyEl, rootPath, this.expandedPaths);
    }

    const containerEl = el.createDiv({ cls: 'nested-properties-container' });
    this.renderNestedValue(containerEl, value, ctx, rootPath, (newValue: unknown) => {
      ctx.onChange(newValue);
    });

    setTimeout(() => {
      const metadataContainerEl = containerEl.closest('.metadata-container');
      if (metadataContainerEl instanceof HTMLElement) {
        injectHeaderButtons(metadataContainerEl, this.expandedPaths);
      }

      if (this.pendingFocusKey) {
        const key = this.pendingFocusKey;
        this.pendingFocusKey = null;
        for (const input of containerEl.querySelectorAll('.metadata-property-key-input')) {
          if (input instanceof HTMLInputElement && input.value === key) {
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
      type: OBJECT_WIDGET_TYPE
    };
  }

  private renderUnknownWidget(next: UnknownRenderFn, el: HTMLElement, value: unknown, ctx: PropertyRenderContext): PropertyWidgetComponentBase {
    if (isSimpleArray(value)) {
      const iconEl = el.closest('.metadata-property')?.querySelector('.metadata-property-key .metadata-property-icon');
      if (iconEl instanceof HTMLElement) {
        setIcon(iconEl, this.listWidget.icon);
      }
      return this.listWidget.render(el, value, ctx);
    }
    if (isComplexValue(value)) {
      return this.objectWidget.render(el, value, ctx);
    }
    return next(el, value, ctx);
  }

  private showNestedPropertyMenu(
    evt: MouseEvent,
    label: string,
    value: unknown,
    onValueChange: (newValue: unknown) => void,
    onDelete: () => void
  ): void {
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
      const currentWidget = this.getWidget(label, value);
      for (const widget of Object.values(this.app.metadataTypeManager.registeredTypeWidgets)) {
        if (widget.reservedKeys && !widget.reservedKeys.contains(label)) {
          continue;
        }
        submenu.addItem((subItem) => {
          subItem.setTitle(widget.name())
            .setIcon(widget.icon)
            .setChecked(widget.type === currentWidget.type)
            .onClick(convertAsyncToSync(async () => {
              await this.changeType(widget, value, onValueChange);
            }));
        });
      }
    });
    menu.addItem((item) => {
      item.setTitle('Cut')
        .setIcon('lucide-scissors')
        .setSection('action')
        .onClick(convertAsyncToSync(async () => {
          await navigator.clipboard.writeText(JSON.stringify({ [label]: value }));
          onDelete();
        }));
    });
    menu.addItem((item) => {
      item.setTitle('Copy')
        .setIcon('lucide-copy')
        .setSection('action')
        .onClick(convertAsyncToSync(async () => {
          await navigator.clipboard.writeText(JSON.stringify({ [label]: value }));
        }));
    });
    menu.addItem((item) => {
      item.setTitle('Paste')
        .setIcon('lucide-clipboard-paste')
        .setSection('action')
        .onClick(convertAsyncToSync(async () => {
          try {
            const text = await navigator.clipboard.readText();
            const parsed = JSON.parse(text) as unknown;
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

function createSummary(parentEl: HTMLElement, value: unknown, propertyEl: HTMLElement, path: string, expandedPaths: Set<string>): void {
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

function injectHeaderButtons(metadataContainerEl: HTMLElement, expandedPaths: Set<string>): void {
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
  updateToggleButton(toggleButton, metadataContainerEl);

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
    updateToggleButton(toggleButton, metadataContainerEl);
  });
}

function renderAddItemButton(containerEl: HTMLElement, arr: unknown[], onValueChange: (newValue: unknown) => void): void {
  const addItemButton = containerEl.createDiv({ cls: 'nested-properties-add-item' });
  setIcon(addItemButton, 'plus');
  addItemButton.createSpan({ text: 'Add item' });
  addItemButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onValueChange([...arr, '']);
  });
}

function renderAddPropertyButton(
  containerEl: HTMLElement,
  obj: GenericObject,
  onValueChange: (newValue: unknown) => void,
  setPendingFocusKey: (key: string) => void
): void {
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

function updateToggleButton(toggleButton: HTMLElement, metadataContainerEl: HTMLElement): void {
  const allCollapsibles = metadataContainerEl.querySelectorAll('.nested-properties-collapsible');
  const allCollapsed = allCollapsibles.length > 0 && Array.from(allCollapsibles).every((el) => el.classList.contains('is-collapsed'));

  toggleButton.setAttribute('aria-label', allCollapsed ? 'Expand all nested properties' : 'Collapse all nested properties');
  toggleButton.empty();
  setIcon(toggleButton, allCollapsed ? 'chevrons-up-down' : 'chevrons-down-up');
}
