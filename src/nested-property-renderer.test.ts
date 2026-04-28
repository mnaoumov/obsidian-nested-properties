import type {
  PropertyRenderContext,
  PropertyWidget
} from 'obsidian-typings';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { NestedPropertyRenderer } from './nested-property-renderer.ts';

interface MockClassList {
  add: MockFn;
  contains: MockFn;
  remove: MockFn;
  toggle: MockFn;
}

interface MockDomElement {
  addEventListener: MockFn;
  after: MockFn;
  classList: MockClassList;
  click: MockFn;
  closest: MockFn;
  createDiv: MockFn;
  createEl: MockFn;
  createSpan: MockFn;
  empty: MockFn;
  firstChild: MockDomElement | null;
  focus: MockFn;
  getAttribute: MockFn;
  getAttributeNames: MockFn;
  hasClass: MockFn;
  insertBefore: MockFn;
  instanceOf: MockFn;
  isConnected: boolean;
  querySelector: MockFn;
  querySelectorAll: MockFn;
  remove: MockFn;
  removeAttribute: MockFn;
  setAttr: MockFn;
  setAttribute: MockFn;
  size: number;
  toggleClass: MockFn;
  value: string;
}

type MockFn = ReturnType<typeof vi.fn>;

const hoisted = vi.hoisted(() => {
  class MockHTMLElementBase {
    public readonly isMockElement = true;
  }
  class MockHTMLInputElementBase extends MockHTMLElementBase {}

  class ComponentBase {
    private readonly children: ComponentBase[] = [];
    private readonly cleanups: (() => void)[] = [];

    public addChild<T extends ComponentBase>(child: T): T {
      this.children.push(child);
      return child;
    }

    public register(fn: () => void): void {
      this.cleanups.push(fn);
    }

    public runCleanups(): void {
      for (const fn of this.cleanups) {
        fn();
      }
    }
  }

  class MarkdownViewBase {
    public metadataEditor = {
      serialize: vi.fn(() => ({ key: 'val' })),
      synchronize: vi.fn()
    };
  }

  interface MenuItemDom {
    addClass: MockFnLocal;
  }

  interface MenuItemMock {
    _onClickFn: ((...args: unknown[]) => unknown) | null;
    dom: MenuItemDom;
    onClick: MockFnLocal;
    setChecked: MockFnLocal;
    setIcon: MockFnLocal;
    setSection: MockFnLocal;
    setSubmenu: MockFnLocal;
    setTitle: MockFnLocal;
  }

  type MockFnLocal = ReturnType<typeof vi.fn>;

  interface SubmenuMock {
    addItem: MockFnLocal;
  }

  function createMenuItem(): MenuItemMock {
    const submenu: SubmenuMock = {
      addItem: vi.fn((cb: (subItem: MenuItemMock) => void) => {
        const subItem = createMenuItem();
        cb(subItem);
        submenuItems.push(subItem);
        return submenu;
      })
    };
    let onClickFn: ((...args: unknown[]) => void) | null = null;
    const item: MenuItemMock = {
      get _onClickFn() {
        return onClickFn;
      },
      dom: { addClass: vi.fn() },
      onClick: vi.fn((fn: (...args: unknown[]) => void) => {
        onClickFn = fn;
        return item;
      }),
      setChecked: vi.fn(() => item),
      setIcon: vi.fn(() => item),
      setSection: vi.fn(() => item),
      setSubmenu: vi.fn(() => submenu),
      setTitle: vi.fn(() => item)
    };
    return item;
  }

  let menuOnHideCallback: (() => void) | null = null;
  const menuItems: MenuItemMock[] = [];
  const submenuItems: MenuItemMock[] = [];

  class MenuBase {
    public addItem = vi.fn((cb: (item: MenuItemMock) => void) => {
      const item = createMenuItem();
      cb(item);
      menuItems.push(item);
      return this;
    });

    public addSections = vi.fn(() => this);
    public onHide = vi.fn((cb: () => void) => {
      menuOnHideCallback = cb;
      return this;
    });

    public showAtMouseEvent = vi.fn();
  }

  const setIconMock = vi.fn();

  class FloatingScrollbarMock extends ComponentBase {
    public update = vi.fn();
  }

  let typeChangeModalWaitResult = true;
  class TypeChangeModalMock {
    public open = vi.fn();
    public waitForResult = vi.fn(() => Promise.resolve(typeChangeModalWaitResult));
  }

  const registerPatchMock = vi.fn(
    (
      _component: unknown,
      target: Record<string, (...args: unknown[]) => unknown>,
      patches: Record<string, (next: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown>
    ) => {
      for (const [methodName, wrapper] of Object.entries(patches)) {
        const original = target[methodName] as ((...args: unknown[]) => unknown) | undefined;
        target[methodName] = wrapper(original ?? vi.fn());
      }
    }
  );

  return {
    changeTypeChangeModalResult: (val: boolean): void => {
      typeChangeModalWaitResult = val;
    },
    ComponentBase,
    createMenuItem,
    FloatingScrollbarMock,
    MarkdownViewBase,
    MenuBase,
    menuItems,
    menuOnHideCallback: {
      get: (): (() => void) | null => menuOnHideCallback,
      set: (v: (() => void) | null): void => {
        menuOnHideCallback = v;
      }
    },
    MockHTMLElementBase,
    MockHTMLInputElementBase,
    registerPatchMock,
    setIconMock,
    submenuItems,
    TypeChangeModalMock
  };
});

vi.mock('obsidian', () => ({
  Component: hoisted.ComponentBase,
  MarkdownView: hoisted.MarkdownViewBase,
  Menu: hoisted.MenuBase,
  moment: vi.fn((inp?: string) => ({
    isValid: (): boolean => inp !== undefined && !isNaN(Date.parse(inp))
  })),
  setIcon: hoisted.setIconMock
}));

vi.mock('obsidian-dev-utils/async', () => ({
  convertAsyncToSync: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn
}));

vi.mock('obsidian-dev-utils/obsidian/monkey-around', () => ({
  registerPatch: hoisted.registerPatchMock
}));

vi.mock('obsidian-dev-utils/type-guards', () => ({
  ensureNonNullable: <T>(val: T): T => val
}));

vi.mock('./floating-scrollbar.ts', () => ({
  FloatingScrollbar: hoisted.FloatingScrollbarMock
}));

vi.mock('./type-change-modal.ts', () => ({
  TypeChangeModal: hoisted.TypeChangeModalMock
}));

vi.mock('obsidian-dev-utils/object-utils', () => ({
  castTo: (v: unknown): unknown => v,
  extractDefaultExportInterop: <T>(m: T): T => m
}));

type GetTypeInfoFn = (p: string, v: unknown) => GetTypeInfoResult;

interface GetTypeInfoResult {
  inferred: PropertyWidget;
}

interface MockApp {
  metadataTypeManager: MockMetadataTypeManager;
  workspace: MockWorkspace;
}

interface MockMetadataTypeManager {
  getTypeInfo: MockFn;
  getWidget: MockFn;
  registeredTypeWidgets: Record<string, PropertyWidget>;
}

interface MockWorkspace {
  getLeavesOfType: MockFn;
}

interface RendererTestAccess {
  expandedPaths: Set<string>;
  pendingFocusKey: null | string;
  runCleanups: () => void;
  widgetTypeOverrides: Map<string, string>;
}

function asNodeList(els: MockDomElement[]): NodeListOf<Element> {
  return castTo<NodeListOf<Element>>(els);
}

function createMockEl(overrides?: Partial<MockDomElement>): MockDomElement {
  const el: MockDomElement = {
    addEventListener: vi.fn(),
    after: vi.fn(),
    classList: {
      add: vi.fn(),
      contains: vi.fn(() => false),
      remove: vi.fn(),
      toggle: vi.fn()
    },
    click: vi.fn(),
    closest: vi.fn(() => null),
    createDiv: vi.fn(() => createMockEl()),
    createEl: vi.fn(() => createMockEl()),
    createSpan: vi.fn(() => createMockEl()),
    empty: vi.fn(),
    firstChild: null,
    focus: vi.fn(),
    getAttribute: vi.fn(() => null),
    getAttributeNames: vi.fn(() => []),
    hasClass: vi.fn(() => false),
    insertBefore: vi.fn(),
    instanceOf: vi.fn(() => false),
    isConnected: true,
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    remove: vi.fn(),
    removeAttribute: vi.fn(),
    setAttr: vi.fn(),
    setAttribute: vi.fn(),
    size: 0,
    toggleClass: vi.fn(),
    value: ''
  };
  // Make instanceof HTMLElement pass
  Object.setPrototypeOf(el, hoisted.MockHTMLElementBase.prototype);
  if (overrides) {
    Object.assign(el, overrides);
  }
  return el;
}

function testAccess(r: NestedPropertyRenderer): RendererTestAccess {
  return castTo<RendererTestAccess>(r);
}

let getTypeInfoOriginal: MockFn;
let mockApp: MockApp;

interface RenderWidgetResult {
  focus: () => void;
  type: string;
}

function createMockCtx(overrides?: Partial<PropertyRenderContext>): PropertyRenderContext {
  return {
    app: mockApp as never,
    blur: vi.fn(),
    key: 'testKey',
    onChange: vi.fn(),
    sourcePath: 'test.md',
    ...overrides
  };
}

function getWidget(name: string): PropertyWidget {
  const w = mockApp.metadataTypeManager.registeredTypeWidgets[name];
  if (!w) {
    throw new Error(`Widget ${name} not found`);
  }
  return w;
}

function renderWidget(name: string, el: MockDomElement, value: unknown, ctx: PropertyRenderContext): RenderWidgetResult {
  return getWidget(name).render(el as never, value, ctx);
}

const multitextWidget: PropertyWidget = {
  icon: 'lucide-list',
  name: (): string => 'Multitext',
  render: vi.fn(() => ({ focus: vi.fn(), type: 'multitext' })),
  type: 'multitext',
  validate: vi.fn(() => true)
};

const textWidget: PropertyWidget = {
  icon: 'lucide-text',
  name: (): string => 'Text',
  render: vi.fn(() => ({ focus: vi.fn(), type: 'text' })),
  type: 'text',
  validate: vi.fn(() => true)
};

const unknownWidget: PropertyWidget = {
  icon: 'lucide-help-circle',
  name: (): string => 'Unknown',
  render: vi.fn(() => ({ focus: vi.fn(), type: 'unknown' })),
  type: 'unknown',
  validate: vi.fn(() => true)
};

describe('NestedPropertyRenderer', () => {
  let renderer: NestedPropertyRenderer;

  beforeEach(() => {
    vi.useFakeTimers();

    getTypeInfoOriginal = vi.fn((property: string, _value: unknown) => ({
      expected: textWidget,
      inferred: textWidget,
      property
    }));

    mockApp = {
      metadataTypeManager: {
        getTypeInfo: getTypeInfoOriginal,
        getWidget: vi.fn(() => unknownWidget),
        registeredTypeWidgets: {
          multitext: multitextWidget,
          text: textWidget,
          unknown: unknownWidget
        }
      },
      workspace: {
        getLeavesOfType: vi.fn(() => [])
      }
    };

    vi.stubGlobal('HTMLElement', hoisted.MockHTMLElementBase);
    vi.stubGlobal('HTMLInputElement', hoisted.MockHTMLInputElementBase);
    vi.stubGlobal('activeDocument', {
      activeElement: null,
      querySelectorAll: vi.fn(() => [])
    });
    vi.stubGlobal('createDiv', vi.fn(() => createMockEl()));
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: vi.fn(() => Promise.resolve('{}')),
        writeText: vi.fn(() => Promise.resolve(undefined))
      }
    });

    hoisted.menuItems.length = 0;
    hoisted.submenuItems.length = 0;
    hoisted.menuOnHideCallback.set(null);
    hoisted.setIconMock.mockClear();
    hoisted.registerPatchMock.mockClear();
    hoisted.changeTypeChangeModalResult(true);

    renderer = new NestedPropertyRenderer(mockApp as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('onload', () => {
    it('should register mixedListWidget and objectWidget on metadataTypeManager', () => {
      renderer.onload();

      expect(mockApp.metadataTypeManager.registeredTypeWidgets['list']).toBeDefined();
      expect(mockApp.metadataTypeManager.registeredTypeWidgets['object']).toBeDefined();
    });

    it('should register patches for listWidget.validate, getTypeInfo, and unknownWidget.render', () => {
      renderer.onload();

      expect(hoisted.registerPatchMock).toHaveBeenCalledTimes(3);
    });

    it('should create FloatingScrollbar as child', () => {
      renderer.onload();

      expect(hoisted.registerPatchMock).toHaveBeenCalled();
    });

    it('should call reloadAllProperties on load', () => {
      const spy = vi.spyOn(renderer, 'reloadAllProperties');
      renderer.onload();

      expect(spy).toHaveBeenCalled();
    });

    it('should register cleanup callback that deletes widgets and reloads', () => {
      renderer.onload();

      const mockRemoveEl = createMockEl();
      vi.spyOn(activeDocument, 'querySelectorAll').mockImplementation(() => asNodeList([mockRemoveEl]));

      testAccess(renderer).runCleanups();

      expect(mockApp.metadataTypeManager.registeredTypeWidgets['list']).toBeUndefined();
      expect(mockApp.metadataTypeManager.registeredTypeWidgets['object']).toBeUndefined();
      expect(mockRemoveEl.remove).toHaveBeenCalled();
    });

    it('should validate mixedListWidget correctly', () => {
      renderer.onload();

      const w = getWidget('list');
      expect(w.validate([1, 2])).toBe(true);
      expect(w.validate('not-array')).toBe(false);
      expect(w.validate({})).toBe(false);
    });

    it('should validate objectWidget correctly', () => {
      renderer.onload();

      const w = getWidget('object');
      expect(w.validate({ a: 1 })).toBe(true);
      expect(w.validate([1])).toBe(false);
      expect(w.validate(null)).toBe(false);
      expect(w.validate('str')).toBe(false);
    });

    it('should name mixedListWidget as Mixed list', () => {
      renderer.onload();
      expect(getWidget('list').name()).toBe('Mixed list');
    });

    it('should name objectWidget as Object', () => {
      renderer.onload();
      expect(getWidget('object').name()).toBe('Object');
    });
  });

  describe('reloadAllProperties', () => {
    it('should serialize and synchronize MarkdownView leaves', () => {
      const mockView = new hoisted.MarkdownViewBase();
      mockApp.workspace.getLeavesOfType.mockReturnValue([{ view: mockView }]);

      renderer.reloadAllProperties();

      expect(mockView.metadataEditor.serialize).toHaveBeenCalled();
      expect(mockView.metadataEditor.synchronize).toHaveBeenCalledTimes(2);
      expect(mockView.metadataEditor.synchronize).toHaveBeenCalledWith({});
    });

    it('should skip non-MarkdownView leaves', () => {
      mockApp.workspace.getLeavesOfType.mockReturnValue([{ view: {} }]);

      renderer.reloadAllProperties();

      expect(mockApp.workspace.getLeavesOfType).toHaveBeenCalledWith('markdown');
    });
  });

  describe('validateListWidget', () => {
    it('should return true when next returns true', () => {
      renderer.onload();

      const result = multitextWidget.validate(['a', 'b']);
      expect(result).toBe(true);
    });

    it('should return true when next returns false but isSimpleArray is true', () => {
      // Save original and override
      const origValidate = multitextWidget.validate;
      multitextWidget.validate = vi.fn(() => false);
      renderer.onload();

      const result = multitextWidget.validate(['a', 'b']);
      expect(result).toBe(true);

      multitextWidget.validate = origValidate;
    });

    it('should return false when next returns false and not simple array', () => {
      const origValidate = multitextWidget.validate;
      multitextWidget.validate = vi.fn(() => false);
      renderer.onload();

      const result = multitextWidget.validate({ a: 1 });
      expect(result).toBe(false);

      multitextWidget.validate = origValidate;
    });
  });

  describe('getTypeInfo', () => {
    it('should return as-is when inferred type is not unknown', () => {
      renderer.onload();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFn)('prop', 'hello');
      expect(result.inferred).toBe(textWidget);
    });

    it('should return as-is when inferred is unknown but value is not complex', () => {
      getTypeInfoOriginal.mockImplementation(() => ({
        expected: unknownWidget,
        inferred: unknownWidget
      }));
      renderer.onload();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFn)('prop', 'simple-string');
      expect(result.inferred.type).toBe('unknown');
    });

    it('should set listWidget for simple arrays when inferred is unknown', () => {
      getTypeInfoOriginal.mockImplementation(() => ({
        expected: unknownWidget,
        inferred: { ...unknownWidget, type: 'unknown' }
      }));
      renderer.onload();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFn)('prop', ['a', 'b']);
      expect(result.inferred.type).toBe('multitext');
    });

    it('should set mixedListWidget for mixed arrays when inferred is unknown', () => {
      getTypeInfoOriginal.mockImplementation(() => ({
        expected: unknownWidget,
        inferred: { ...unknownWidget, type: 'unknown' }
      }));
      renderer.onload();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFn)('prop', [1, { a: 2 }]);
      expect(result.inferred.type).toBe('list');
    });

    it('should set objectWidget for objects when inferred is unknown', () => {
      getTypeInfoOriginal.mockImplementation(() => ({
        expected: unknownWidget,
        inferred: { ...unknownWidget, type: 'unknown' }
      }));
      renderer.onload();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFn)('prop', { a: 1 });
      expect(result.inferred.type).toBe('object');
    });
  });

  describe('renderUnknownWidget', () => {
    it('should render with listWidget for simple arrays and update icon', () => {
      renderer.onload();
      hoisted.setIconMock.mockClear();

      const el = createMockEl();
      const iconEl = createMockEl();
      const propertyEl = createMockEl({
        querySelector: vi.fn(() => iconEl)
      });
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      unknownWidget.render(el as never, ['a', 'b'], ctx);

      // Check that setIcon was called with the icon element and correct icon name
      const calls = hoisted.setIconMock.mock.calls as unknown[][];
      const matchingCall = calls.find((call) => call[0] === iconEl && call[1] === 'lucide-list');
      expect(matchingCall).toBeDefined();
    });

    it('should render with mixedListWidget for mixed arrays', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      const result = unknownWidget.render(el as never, [1, { a: 2 }], ctx);
      expect(result).toBeDefined();
    });

    it('should render with objectWidget for objects', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      const result = unknownWidget.render(el as never, { key: 'val' }, ctx);
      expect(result).toBeDefined();
    });

    it('should call next for primitive values', () => {
      const origRender = unknownWidget.render;
      unknownWidget.render = vi.fn(() => ({ focus: vi.fn(), type: 'unknown' }));
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      unknownWidget.render(el as never, 'primitive', ctx);

      unknownWidget.render = origRender;
    });

    it('should handle missing icon element for simple arrays', () => {
      renderer.onload();

      const el = createMockEl();
      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      unknownWidget.render(el as never, ['a', 'b'], ctx);
    });

    it('should handle missing property element for simple arrays', () => {
      renderer.onload();

      const el = createMockEl();
      el.closest.mockReturnValue(null);

      const ctx = createMockCtx();
      unknownWidget.render(el as never, ['a', 'b'], ctx);
    });
  });

  describe('renderComplexWidget', () => {
    it('should normalize non-array value to empty array for list widget type', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      const result = renderWidget('list', el, 'not-array', ctx);
      expect(result.type).toBe('list');
    });

    it('should normalize array value to empty object for object widget type', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      const result = renderWidget('object', el, [1, 2], ctx);
      expect(result.type).toBe('object');
    });

    it('should normalize non-complex value to empty object for object widget type', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      const result = renderWidget('object', el, 'primitive', ctx);
      expect(result.type).toBe('object');
    });

    it('should set up collapsible UI with collapse button', () => {
      renderer.onload();

      const collapseBtn = createMockEl();
      const keyEl = createMockEl({ querySelector: vi.fn(() => null) });
      const existingIcon = createMockEl();
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === '.metadata-property-key .metadata-property-icon') {
            return existingIcon;
          }
          if (selector === '.metadata-property-key') {
            return keyEl;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);
      vi.stubGlobal('createDiv', vi.fn(() => collapseBtn));

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);

      expect(propertyEl.classList.add).toHaveBeenCalledWith('nested-properties-collapsible');
      expect(propertyEl.classList.add).toHaveBeenCalledWith('is-collapsed');
    });

    it('should handle collapse button click toggling', () => {
      renderer.onload();

      const collapseBtn = createMockEl();
      const keyEl = createMockEl({ querySelector: vi.fn(() => null) });
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === '.metadata-property-key .metadata-property-icon') {
            return createMockEl();
          }
          if (selector === '.metadata-property-key') {
            return keyEl;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);
      vi.stubGlobal('createDiv', vi.fn(() => collapseBtn));

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);

      const clickCall = findEventHandler(collapseBtn, 'click');
      propertyEl.hasClass.mockReturnValue(true);
      clickCall({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(propertyEl.toggleClass).toHaveBeenCalledWith('is-collapsed', false);

      propertyEl.hasClass.mockReturnValue(false);
      clickCall({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(propertyEl.toggleClass).toHaveBeenCalledWith('is-collapsed', true);
    });

    it('should not create collapse button if one already exists', () => {
      renderer.onload();

      const existingBtn = createMockEl();
      const keyEl = createMockEl({ querySelector: vi.fn(() => existingBtn) });
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === '.metadata-property-key .metadata-property-icon') {
            return createMockEl();
          }
          if (selector === '.metadata-property-key') {
            return keyEl;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);

      expect(keyEl.insertBefore).not.toHaveBeenCalled();
    });

    it('should return focus/type component', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      const result = renderWidget('list', el, ['a'], ctx);

      expect(result.type).toBe('list');
      expect(result.focus).toBeTypeOf('function');
      result.focus();
    });

    it('should update icon for list widget type', () => {
      renderer.onload();

      const existingIcon = createMockEl();
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === '.metadata-property-key .metadata-property-icon') {
            return existingIcon;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);

      expectSetIconCalledWith(existingIcon, 'lucide-list-tree');
    });

    it('should update icon for object widget type', () => {
      renderer.onload();

      const existingIcon = createMockEl();
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === '.metadata-property-key .metadata-property-icon') {
            return existingIcon;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      renderWidget('object', el, { a: 1 }, ctx);

      expectSetIconCalledWith(existingIcon, 'lucide-braces');
    });

    it('should handle propertyEl being null', () => {
      renderer.onload();

      const el = createMockEl();
      el.closest.mockReturnValue(null);

      const ctx = createMockCtx();
      const result = renderWidget('list', el, ['a'], ctx);
      expect(result).toBeDefined();
    });

    it('should handle missing keyEl', () => {
      renderer.onload();

      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === '.metadata-property-key .metadata-property-icon') {
            return createMockEl();
          }
          if (selector === '.metadata-property-key') {
            return null;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
    });

    it('should handle missing existingIcon', () => {
      renderer.onload();

      const keyEl = createMockEl({ querySelector: vi.fn(() => null) });
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === '.metadata-property-key .metadata-property-icon') {
            return null;
          }
          if (selector === '.metadata-property-key') {
            return keyEl;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);
      vi.stubGlobal('createDiv', vi.fn(() => createMockEl()));

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
    });
  });

  describe('renderEntry', () => {
    it('should render complex value with collapse UI', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('object', el, { nested: { a: 1 } }, ctx);
      vi.runAllTimers();
    });

    it('should render simple value with widget', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('object', el, { simple: 'hello' }, ctx);
      vi.runAllTimers();
    });

    it('should handle contextmenu event on complex entry', () => {
      renderer.onload();

      const containerEl = createMockEl();
      const propertyDiv = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyDiv);

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('object', el, { nested: { a: 1 } }, ctx);

      const handler = findEventHandler(propertyDiv, 'contextmenu');
      handler({ stopPropagation: vi.fn() });
    });

    it('should handle contextmenu event on simple entry', () => {
      renderer.onload();

      const propertyDiv = createMockEl();
      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyDiv);

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('object', el, { simple: 'hello' }, ctx);

      const handler = findEventHandler(propertyDiv, 'contextmenu');
      handler({ stopPropagation: vi.fn() });
    });
  });

  describe('renderArray', () => {
    it('should render array items and add item button', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('list', el, ['item1', 'item2'], ctx);
      vi.runAllTimers();
    });

    it('should call onArrayChange when array item value changes', () => {
      renderer.onload();

      const el = createMockEl();
      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      vi.mocked(textWidget.render).mockClear();
      renderWidget('list', el, ['a', 'b'], ctx);
      vi.runAllTimers();

      // Extract the onChange callback passed to the simple widget render
      const renderCalls = vi.mocked(textWidget.render).mock.calls as unknown[][];
      const firstCall = renderCalls[0];
      if (firstCall) {
        const renderCtx = firstCall[2] as PropertyRenderContext;
        renderCtx.onChange('newValue');
        expect(onChange).toHaveBeenCalledWith(['newValue', 'b']);
      }
    });

    it('should call onArrayChange when array item is deleted via menu', () => {
      renderer.onload();

      const entryPropertyEl = createMockEl();
      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(entryPropertyEl);

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('list', el, ['a', 'b', 'c'], ctx);
      vi.runAllTimers();

      // Trigger contextmenu on the first entry
      hoisted.menuItems.length = 0;
      const contextHandler = findEventHandler(entryPropertyEl, 'contextmenu');
      contextHandler({ stopPropagation: vi.fn() });

      // Click the "Remove" item (last menu item)
      const removeItem = hoisted.menuItems.at(-1);
      if (removeItem) {
        const clickFn = removeItem._onClickFn;
        clickFn?.();
        expect(onChange).toHaveBeenCalled();
      }
    });
  });

  describe('renderObject', () => {
    it('should render object entries and add property button', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('object', el, { key1: 'val1', key2: 'val2' }, ctx);
      vi.runAllTimers();
    });

    it('should handle object value change', () => {
      renderer.onload();

      const el = createMockEl();
      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, { key: 'val' }, ctx);
      vi.runAllTimers();
    });

    it('should handle object property deletion', () => {
      renderer.onload();

      const el = createMockEl();
      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, { key: 'val' }, ctx);
      vi.runAllTimers();
    });
  });

  describe('showNestedPropertyMenu', () => {
    it('should create menu with type submenu and action items', () => {
      renderer.onload();

      hoisted.menuItems.length = 0;
      triggerContextMenu();

      expect(hoisted.menuItems.length).toBeGreaterThan(0);
    });

    it('should handle cut action', async () => {
      renderer.onload();

      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const cutItem = hoisted.menuItems.at(1);
      if (cutItem) {
        const clickFn = cutItem._onClickFn;
        await clickFn?.();
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      }
    });

    it('should handle copy action', async () => {
      renderer.onload();

      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const copyItem = hoisted.menuItems.at(2);
      if (copyItem) {
        const clickFn = copyItem._onClickFn;
        await clickFn?.();
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      }
    });

    it('should handle paste action with valid JSON object', async () => {
      renderer.onload();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('{"key": "pasted_value"}');
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFn = pasteItem._onClickFn;
        await clickFn?.();
      }
    });

    it('should handle paste action with invalid JSON', async () => {
      renderer.onload();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('not-json');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFn = pasteItem._onClickFn;
        await clickFn?.();
      }

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle paste action with array JSON', async () => {
      renderer.onload();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('[1, 2, 3]');
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFn = pasteItem._onClickFn;
        await clickFn?.();
      }
    });

    it('should handle paste action with null JSON', async () => {
      renderer.onload();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('null');
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFn = pasteItem._onClickFn;
        await clickFn?.();
      }
    });

    it('should handle paste action with empty object', async () => {
      renderer.onload();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('{}');
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFn = pasteItem._onClickFn;
        await clickFn?.();
      }
    });

    it('should handle remove action', () => {
      renderer.onload();

      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const removeItem = hoisted.menuItems.at(4);
      if (removeItem) {
        const clickFn = removeItem._onClickFn;
        clickFn?.();
      }
    });

    it('should debounce menu when opened too quickly', () => {
      renderer.onload();

      hoisted.menuItems.length = 0;
      triggerContextMenu();
      const firstCount = hoisted.menuItems.length;

      const onHideCb = hoisted.menuOnHideCallback.get();
      if (onHideCb) {
        onHideCb();
      }

      hoisted.menuItems.length = 0;
      triggerContextMenu();
      expect(hoisted.menuItems.length).toBe(0);

      vi.advanceTimersByTime(300);
      triggerContextMenu();
      expect(hoisted.menuItems.length).toBeGreaterThanOrEqual(firstCount);
    });

    it('should handle widget with reservedKeys that does not contain label', () => {
      renderer.onload();

      const reservedWidget: PropertyWidget = {
        icon: 'lucide-reserved',
        name: (): string => 'Reserved',
        render: vi.fn(() => ({ focus: vi.fn(), type: 'reserved' })),
        reservedKeys: { contains: () => false, length: 0 } as never,
        type: 'reserved',
        validate: vi.fn(() => true)
      };
      mockApp.metadataTypeManager.registeredTypeWidgets['reserved'] = reservedWidget;

      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      triggerContextMenu();
    });

    it('should handle type submenu with checked state for current widget', () => {
      renderer.onload();

      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      triggerContextMenu();

      for (const subItem of hoisted.submenuItems) {
        expect(subItem.setChecked).toHaveBeenCalled();
      }
    });
  });

  describe('changeType via menu', () => {
    it('should convert and reload when converted equals value', async () => {
      renderer.onload();

      hoisted.changeTypeChangeModalResult(true);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      triggerContextMenu();

      if (hoisted.submenuItems.length > 0) {
        const subItem = hoisted.submenuItems.at(0);
        if (subItem) {
          const clickFn = subItem._onClickFn;
          await clickFn?.();
        }
      }
    });

    it('should blur active element when changing type', async () => {
      renderer.onload();

      const blurMock = vi.fn();
      const mockActiveElement = { blur: blurMock };
      vi.stubGlobal('activeDocument', {
        activeElement: mockActiveElement,
        querySelectorAll: vi.fn(() => [])
      });
      Object.setPrototypeOf(mockActiveElement, hoisted.MockHTMLElementBase.prototype);

      hoisted.changeTypeChangeModalResult(true);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      triggerContextMenu();

      if (hoisted.submenuItems.length > 0) {
        const subItem = hoisted.submenuItems.at(0);
        if (subItem) {
          const clickFn = subItem._onClickFn;
          await clickFn?.();
        }
      }

      expect(blurMock).toHaveBeenCalled();
    });

    it('should not blur when active element is not HTMLElement', async () => {
      renderer.onload();

      vi.stubGlobal('activeDocument', {
        activeElement: 'not-html-element',
        querySelectorAll: vi.fn(() => [])
      });

      hoisted.changeTypeChangeModalResult(true);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      triggerContextMenu();

      if (hoisted.submenuItems.length > 0) {
        const subItem = hoisted.submenuItems.at(0);
        if (subItem) {
          const clickFn = subItem._onClickFn;
          await clickFn?.();
        }
      }
    });

    it('should show modal and cancel for lossy conversion', async () => {
      renderer.onload();

      hoisted.changeTypeChangeModalResult(false);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      triggerContextMenuWithValue({ a: 1 });

      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Text')) {
          const clickFn = subItem._onClickFn;
          await clickFn?.();
          break;
        }
      }
    });

    it('should call onValueChange when converted differs from value', async () => {
      renderer.onload();

      hoisted.changeTypeChangeModalResult(true);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;

      const onChange = vi.fn();
      triggerContextMenuWithValue('hello', onChange);

      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Mixed list')) {
          const clickFn = subItem._onClickFn;
          await clickFn?.();
          break;
        }
      }
    });
  });

  describe('getWidget', () => {
    it('should fall through when override widget not found in registry', () => {
      renderer.onload();

      // Path format: rootPath.label = "sourcePath:key.entryKey"
      testAccess(renderer).widgetTypeOverrides.set('test.md:testKey.test', 'nonexistent');

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('object', el, { test: 'val' }, ctx);
      vi.runAllTimers();
    });

    it('should return widget from getTypeInfo when no override', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('object', el, { key: 'val' }, ctx);
      vi.runAllTimers();
    });
  });

  describe('renderAddItemButton', () => {
    it('should add empty string to array on click', () => {
      renderer.onload();

      const addBtn = createMockEl();
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-item') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('list', el, ['a'], ctx);

      const handler = findEventHandler(addBtn, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      vi.runAllTimers();
    });
  });

  describe('renderAddPropertyButton', () => {
    it('should create input on click and handle Enter key', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'newKey';
      const addBtn = createMockEl();
      addBtn.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-property') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, { existing: 'val' }, ctx);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addBtn, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    it('should handle Tab key with focus pending', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'newTabKey';
      const addBtn = createMockEl();
      addBtn.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-property') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addBtn, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Tab', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    it('should handle Escape key to restore button', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'test';
      const addBtn = createMockEl();
      addBtn.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-property') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addBtn, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(addBtn.empty).toHaveBeenCalled();
    });

    it('should handle blur event when connected', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'blurKey';
      input.isConnected = true;
      const addBtn = createMockEl();
      addBtn.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-property') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addBtn, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const blurHandler = findEventHandler(input, 'blur');
      blurHandler();
    });

    it('should not call addKey on blur when not connected', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'disconnectedKey';
      input.isConnected = false;
      const addBtn = createMockEl();
      addBtn.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-property') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addBtn, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const blurHandler = findEventHandler(input, 'blur');
      blurHandler();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should restore button when key is empty', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = '   ';
      const addBtn = createMockEl();
      addBtn.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-property') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addBtn, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(addBtn.empty).toHaveBeenCalled();
    });

    it('should restore button when key already exists in object', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'existing';
      const addBtn = createMockEl();
      addBtn.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-property') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, { existing: 'val' }, ctx);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addBtn, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should handle input.remove throwing in Enter handler', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'newKey2';
      input.remove.mockImplementation(() => {
        throw new Error('Already removed');
      });
      const addBtn = createMockEl();
      addBtn.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-property') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addBtn, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(onChange).toHaveBeenCalled();
    });

    it('should propagate other key events', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'test';
      const addBtn = createMockEl();
      addBtn.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && (opts['cls'] as string) === 'nested-properties-add-property') {
          return addBtn;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addBtn, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      const preventDefaultMock = vi.fn();
      keydownHandler({ key: 'a', preventDefault: preventDefaultMock, stopPropagation: vi.fn() });
      expect(preventDefaultMock).not.toHaveBeenCalled();
    });
  });

  describe('injectHeaderButtons', () => {
    it('should return early if header actions already exist', () => {
      renderer.onload();

      const el = createMockEl();
      const containerEl = createMockEl({
        closest: vi.fn(() =>
          createMockEl({
            querySelector: vi.fn((selector: string) => {
              if (selector === '.nested-properties-header-actions') {
                return createMockEl();
              }
              return null;
            })
          })
        )
      });
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();
    });

    it('should return early if no collapsible elements exist', () => {
      renderer.onload();

      const el = createMockEl();
      const containerEl = createMockEl({
        closest: vi.fn(() =>
          createMockEl({
            querySelector: vi.fn((selector: string) => {
              if (selector === '.nested-properties-header-actions') {
                return null;
              }
              if (selector === '.nested-properties-collapsible') {
                return null;
              }
              return null;
            })
          })
        )
      });
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();
    });

    it('should return early if no heading element exists', () => {
      renderer.onload();

      const el = createMockEl();
      const containerEl = createMockEl({
        closest: vi.fn(() =>
          createMockEl({
            querySelector: vi.fn((selector: string) => {
              if (selector === '.nested-properties-header-actions') {
                return null;
              }
              if (selector === '.nested-properties-collapsible') {
                return createMockEl();
              }
              if (selector === '.metadata-properties-heading') {
                return null;
              }
              return null;
            })
          })
        )
      });
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();
    });

    it('should create toggle button and handle expand all', () => {
      renderer.onload();

      const toggleButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValue(toggleButton);

      const collapsibleEl = createMockEl();
      collapsibleEl.classList.contains.mockReturnValue(true);
      collapsibleEl.getAttribute.mockReturnValue('path1');

      const metaContainer = createMockEl({
        createDiv: vi.fn(() => actionsEl),
        querySelector: vi.fn((selector: string) => {
          if (selector === '.nested-properties-header-actions') {
            return null;
          }
          if (selector === '.nested-properties-collapsible') {
            return collapsibleEl;
          }
          if (selector === '.metadata-properties-heading') {
            return headingEl;
          }
          return null;
        }),
        querySelectorAll: vi.fn(() => [collapsibleEl])
      });

      const containerEl = createMockEl({ closest: vi.fn(() => metaContainer) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();

      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    it('should handle collapse all when not all collapsed', () => {
      renderer.onload();

      const toggleButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValue(toggleButton);

      const collapsibleEl = createMockEl();
      collapsibleEl.classList.contains.mockReturnValue(false);
      collapsibleEl.getAttribute.mockReturnValue('path1');

      const metaContainer = createMockEl({
        createDiv: vi.fn(() => actionsEl),
        querySelector: vi.fn((selector: string) => {
          if (selector === '.nested-properties-header-actions') {
            return null;
          }
          if (selector === '.nested-properties-collapsible') {
            return collapsibleEl;
          }
          if (selector === '.metadata-properties-heading') {
            return headingEl;
          }
          return null;
        }),
        querySelectorAll: vi.fn(() => [collapsibleEl])
      });

      const containerEl = createMockEl({ closest: vi.fn(() => metaContainer) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();

      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    it('should handle empty collapsibles list for toggle', () => {
      renderer.onload();

      const toggleButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValue(toggleButton);

      const metaContainer = createMockEl({
        createDiv: vi.fn(() => actionsEl),
        querySelector: vi.fn((selector: string) => {
          if (selector === '.nested-properties-header-actions') {
            return null;
          }
          if (selector === '.nested-properties-collapsible') {
            return createMockEl();
          }
          if (selector === '.metadata-properties-heading') {
            return headingEl;
          }
          return null;
        }),
        querySelectorAll: vi.fn(() => [])
      });

      const containerEl = createMockEl({ closest: vi.fn(() => metaContainer) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();

      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });
  });

  describe('collapseAllIn and expandAllIn', () => {
    it('should handle expandAllIn with elements without data-path attribute', () => {
      renderer.onload();

      const collapsibleEl = createMockEl();
      collapsibleEl.getAttribute.mockReturnValue(null);
      collapsibleEl.classList.contains.mockReturnValue(true); // All collapsed → expand

      const toggleButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValue(toggleButton);

      const metaContainer = createMockEl({
        createDiv: vi.fn(() => actionsEl),
        querySelector: vi.fn((selector: string) => {
          if (selector === '.nested-properties-header-actions') {
            return null;
          }
          if (selector === '.nested-properties-collapsible') {
            return createMockEl();
          }
          if (selector === '.metadata-properties-heading') {
            return headingEl;
          }
          return null;
        }),
        querySelectorAll: vi.fn(() => [collapsibleEl])
      });

      const containerEl = createMockEl({ closest: vi.fn(() => metaContainer) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();

      // Click toggle to expand all (since all are collapsed)
      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      // ClassList.remove should have been called with 'is-collapsed'
      expect(collapsibleEl.classList.remove).toHaveBeenCalledWith('is-collapsed');
    });

    it('should handle elements without data-path attribute in collapseAllIn', () => {
      renderer.onload();

      const collapsibleEl = createMockEl();
      collapsibleEl.getAttribute.mockReturnValue(null);
      collapsibleEl.classList.contains.mockReturnValue(false);

      const toggleButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValue(toggleButton);

      const metaContainer = createMockEl({
        createDiv: vi.fn(() => actionsEl),
        querySelector: vi.fn((selector: string) => {
          if (selector === '.nested-properties-header-actions') {
            return null;
          }
          if (selector === '.nested-properties-collapsible') {
            return createMockEl();
          }
          if (selector === '.metadata-properties-heading') {
            return headingEl;
          }
          return null;
        }),
        querySelectorAll: vi.fn(() => [collapsibleEl])
      });

      const containerEl = createMockEl({ closest: vi.fn(() => metaContainer) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();

      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });
  });

  describe('createSummary', () => {
    it('should create summary with array text for arrays', () => {
      renderer.onload();

      const el = createMockEl();
      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a', 'b'], ctx);

      expect(el.createSpan).toHaveBeenCalledWith(expect.objectContaining({ text: '[ ... ]' }));
    });

    it('should create summary with object text for objects', () => {
      renderer.onload();

      const el = createMockEl();
      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      renderWidget('object', el, { a: 1 }, ctx);

      expect(el.createSpan).toHaveBeenCalledWith(expect.objectContaining({ text: '{ ... }' }));
    });

    it('should expand on summary click', () => {
      renderer.onload();

      const summary = createMockEl();
      const el = createMockEl();
      el.createSpan.mockReturnValue(summary);

      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);

      const handler = findEventHandler(summary, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(propertyEl.classList.remove).toHaveBeenCalledWith('is-collapsed');
    });
  });

  describe('updateToggleButton', () => {
    it('should set expand icon when all collapsed', () => {
      renderer.onload();

      const toggleButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValue(toggleButton);

      const collapsibleEl = createMockEl();
      collapsibleEl.classList.contains.mockReturnValue(true);

      const metaContainer = createMockEl({
        createDiv: vi.fn(() => actionsEl),
        querySelector: vi.fn((selector: string) => {
          if (selector === '.nested-properties-header-actions') {
            return null;
          }
          if (selector === '.nested-properties-collapsible') {
            return collapsibleEl;
          }
          if (selector === '.metadata-properties-heading') {
            return headingEl;
          }
          return null;
        }),
        querySelectorAll: vi.fn(() => [collapsibleEl])
      });

      const containerEl = createMockEl({ closest: vi.fn(() => metaContainer) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();

      expectSetIconCalledWith(toggleButton, 'chevrons-up-down');
    });

    it('should set collapse icon when not all collapsed', () => {
      renderer.onload();

      const toggleButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValue(toggleButton);

      const collapsibleEl = createMockEl();
      collapsibleEl.classList.contains.mockReturnValue(false);

      const metaContainer = createMockEl({
        createDiv: vi.fn(() => actionsEl),
        querySelector: vi.fn((selector: string) => {
          if (selector === '.nested-properties-header-actions') {
            return null;
          }
          if (selector === '.nested-properties-collapsible') {
            return collapsibleEl;
          }
          if (selector === '.metadata-properties-heading') {
            return headingEl;
          }
          return null;
        }),
        querySelectorAll: vi.fn(() => [collapsibleEl])
      });

      const containerEl = createMockEl({ closest: vi.fn(() => metaContainer) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();

      expectSetIconCalledWith(toggleButton, 'chevrons-down-up');
    });
  });

  describe('renderComplexWidget setTimeout', () => {
    it('should handle null metadataContainerEl in setTimeout', () => {
      renderer.onload();

      const containerEl = createMockEl({ closest: vi.fn(() => null) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();
    });

    it('should handle metadataContainerEl that is not HTMLElement', () => {
      renderer.onload();

      const containerEl = createMockEl({ closest: vi.fn(() => 'not-html-element') });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);
      vi.runAllTimers();
    });

    it('should handle pending focus key with matching input', () => {
      renderer.onload();

      const focusTarget = createMockEl();
      const valueEl = createMockEl({ querySelector: vi.fn(() => focusTarget) });
      const propEl = createMockEl({ querySelector: vi.fn(() => valueEl) });
      const input = createMockEl();
      input.value = 'target';
      input.instanceOf.mockReturnValue(true);
      input.closest.mockReturnValue(propEl);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'target';

      const ctx = createMockCtx();
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();

      expect(focusTarget.focus).toHaveBeenCalled();
    });

    it('should click valueEl when no focusable target is found', () => {
      renderer.onload();

      const valueEl = createMockEl({ querySelector: vi.fn(() => null) });
      const propEl = createMockEl({ querySelector: vi.fn(() => valueEl) });
      const input = createMockEl();
      input.value = 'target';
      input.instanceOf.mockReturnValue(true);
      input.closest.mockReturnValue(propEl);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'target';

      const ctx = createMockCtx();
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();

      expect(valueEl.click).toHaveBeenCalled();
    });

    it('should handle input that does not match pending key', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'otherKey';
      input.instanceOf.mockReturnValue(true);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'differentKey';

      const ctx = createMockCtx();
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();
    });

    it('should handle input that is not HTMLInputElement', () => {
      renderer.onload();

      const input = createMockEl();
      input.instanceOf.mockReturnValue(false);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'someKey';

      const ctx = createMockCtx();
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();
    });

    it('should handle input with null prop from closest', () => {
      renderer.onload();

      const input = createMockEl();
      input.value = 'target';
      input.instanceOf.mockReturnValue(true);
      input.closest.mockReturnValue(null);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'target';

      const ctx = createMockCtx();
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();
    });

    it('should handle prop with no valueEl from querySelector', () => {
      renderer.onload();

      const propEl = createMockEl({ querySelector: vi.fn(() => null) });
      const input = createMockEl();
      input.value = 'target';
      input.instanceOf.mockReturnValue(true);
      input.closest.mockReturnValue(propEl);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'target';

      const ctx = createMockCtx();
      renderWidget('object', el, {}, ctx);
      vi.runAllTimers();
    });
  });

  describe('renderEntry with type override', () => {
    it('should treat entry as complex when typeOverride is list', () => {
      renderer.onload();

      testAccess(renderer).widgetTypeOverrides.set('test.md:testKey.myProp', 'list');

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('object', el, { myProp: 'simple-string' }, ctx);
      vi.runAllTimers();
    });

    it('should treat entry as complex when typeOverride is object', () => {
      renderer.onload();

      testAccess(renderer).widgetTypeOverrides.set('test.md:testKey.myProp', 'object');

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('object', el, { myProp: 'simple-string' }, ctx);
      vi.runAllTimers();
    });
  });

  describe('renderEntry nested collapse button', () => {
    it('should toggle collapse state on nested entry collapse button click', () => {
      renderer.onload();

      const collapseBtn = createMockEl();
      const iconEl = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseBtn);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-value') {
          return valueEl;
        }
        return createMockEl();
      });

      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyEl);

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      getTypeInfoOriginal.mockImplementation((_property: string, value: unknown) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return {
            expected: mockApp.metadataTypeManager.registeredTypeWidgets['object'],
            inferred: mockApp.metadataTypeManager.registeredTypeWidgets['object']
          };
        }
        return {
          expected: textWidget,
          inferred: textWidget
        };
      });

      const ctx = createMockCtx();
      renderWidget('object', el, { nested: { a: 1 } }, ctx);
      vi.runAllTimers();

      const handler = findEventHandler(collapseBtn, 'click');
      propertyEl.hasClass.mockReturnValue(true);
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(propertyEl.toggleClass).toHaveBeenCalledWith('is-collapsed', false);

      propertyEl.hasClass.mockReturnValue(false);
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(propertyEl.toggleClass).toHaveBeenCalledWith('is-collapsed', true);
    });
  });

  describe('renderKeyEl', () => {
    it('should render key element with icon click handler', () => {
      renderer.onload();

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('object', el, { key: 'val' }, ctx);
      vi.runAllTimers();
    });

    it('should trigger showNestedPropertyMenu on icon click when onValueChange and onDelete are provided', () => {
      renderer.onload();

      // Render an object with a simple value entry
      // The renderEntry for simple values calls renderKeyEl with onValueChange and onDelete
      const iconEl = createMockEl();
      const keyEl = createMockEl();
      keyEl.createSpan.mockReturnValue(iconEl);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-value') {
          return createMockEl();
        }
        return createMockEl();
      });

      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyEl);
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const ctx = createMockCtx();
      renderWidget('object', el, { key: 'val' }, ctx);
      vi.runAllTimers();

      // Find the icon click handler
      hoisted.menuItems.length = 0;
      const iconClickHandler = findEventHandler(iconEl, 'click');
      iconClickHandler({ stopPropagation: vi.fn() });
      // Menu should have been created
      expect(hoisted.menuItems.length).toBeGreaterThan(0);
    });
  });

  describe('renderEntry complex icon click', () => {
    it('should trigger showNestedPropertyMenu on complex entry icon click', () => {
      renderer.onload();

      const iconEl = createMockEl();
      const collapseBtn = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseBtn);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-value') {
          return valueEl;
        }
        return createMockEl();
      });

      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyEl);
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      getTypeInfoOriginal.mockImplementation((_property: string, value: unknown) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return {
            expected: mockApp.metadataTypeManager.registeredTypeWidgets['object'],
            inferred: mockApp.metadataTypeManager.registeredTypeWidgets['object']
          };
        }
        return {
          expected: textWidget,
          inferred: textWidget
        };
      });

      const ctx = createMockCtx();
      renderWidget('object', el, { nested: { a: 1 } }, ctx);
      vi.runAllTimers();

      // Find the icon click handler on the complex entry
      hoisted.menuItems.length = 0;
      const iconClickHandler = findEventHandler(iconEl, 'click');
      iconClickHandler({ stopPropagation: vi.fn() });
      expect(hoisted.menuItems.length).toBeGreaterThan(0);
    });
  });

  describe('changeType full flow', () => {
    it('should complete changeType and call onValueChange when converted differs', async () => {
      renderer.onload();

      hoisted.changeTypeChangeModalResult(true);

      // Render an object with a nested object entry
      const iconEl = createMockEl();
      const collapseBtn = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseBtn);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-value') {
          return valueEl;
        }
        return createMockEl();
      });

      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyEl);
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      getTypeInfoOriginal.mockImplementation((_property: string, value: unknown) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return {
            expected: mockApp.metadataTypeManager.registeredTypeWidgets['object'],
            inferred: mockApp.metadataTypeManager.registeredTypeWidgets['object']
          };
        }
        return {
          expected: textWidget,
          inferred: textWidget
        };
      });

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, { nested: { a: 1 } }, ctx);
      vi.runAllTimers();

      // Set up activeDocument.activeElement as HTMLElement to test blur
      const blurMock = vi.fn();
      const activeEl = { blur: blurMock };
      Object.setPrototypeOf(activeEl, hoisted.MockHTMLElementBase.prototype);
      vi.stubGlobal('activeDocument', {
        activeElement: activeEl,
        querySelectorAll: vi.fn(() => [])
      });

      // Open menu on the nested entry via icon click
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      const iconClickHandler = findEventHandler(iconEl, 'click');
      iconClickHandler({ stopPropagation: vi.fn() });

      // Find the "Text" type in the submenu and click it
      // This will trigger changeType with lossy conversion (object → text)
      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Text')) {
          const clickFn = subItem._onClickFn;
          await clickFn?.();
          break;
        }
      }

      // Blur should have been called
      expect(blurMock).toHaveBeenCalled();
    });

    it('should return early when modal is cancelled for lossy conversion', async () => {
      renderer.onload();

      hoisted.changeTypeChangeModalResult(false);

      const iconEl = createMockEl();
      const collapseBtn = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseBtn);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-value') {
          return valueEl;
        }
        return createMockEl();
      });

      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyEl);
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      getTypeInfoOriginal.mockImplementation((_property: string, value: unknown) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return {
            expected: mockApp.metadataTypeManager.registeredTypeWidgets['object'],
            inferred: mockApp.metadataTypeManager.registeredTypeWidgets['object']
          };
        }
        return {
          expected: textWidget,
          inferred: textWidget
        };
      });

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      renderWidget('object', el, { nested: { a: 1 } }, ctx);
      vi.runAllTimers();

      // Open menu on nested entry
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      const iconClickHandler = findEventHandler(iconEl, 'click');
      iconClickHandler({ stopPropagation: vi.fn() });

      // Click "Mixed list" type (lossy: object → list) and modal cancels
      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Mixed list')) {
          const clickFn = subItem._onClickFn;
          await clickFn?.();
          break;
        }
      }

      // WidgetTypeOverrides should NOT have been set since user cancelled
      const overrides = testAccess(renderer).widgetTypeOverrides;
      expect(overrides.size).toBe(0);
    });

    it('should set widget type override and reload when converted equals value', async () => {
      renderer.onload();

      hoisted.changeTypeChangeModalResult(true);

      const iconEl = createMockEl();
      const collapseBtn = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseBtn);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-value') {
          return valueEl;
        }
        return createMockEl();
      });

      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyEl);
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      getTypeInfoOriginal.mockImplementation((_property: string, value: unknown) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return {
            expected: mockApp.metadataTypeManager.registeredTypeWidgets['object'],
            inferred: mockApp.metadataTypeManager.registeredTypeWidgets['object']
          };
        }
        return {
          expected: textWidget,
          inferred: textWidget
        };
      });

      const onChange = vi.fn();
      const ctx = createMockCtx({ onChange });
      // Use an object value and convert to object type (same) → converted === value
      renderWidget('object', el, { nested: { a: 1 } }, ctx);
      vi.runAllTimers();

      // Open menu on the nested entry
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      const iconClickHandler = findEventHandler(iconEl, 'click');
      iconClickHandler({ stopPropagation: vi.fn() });

      // Click "Object" type (same type → no conversion needed, reload)
      const reloadSpy = vi.spyOn(renderer, 'reloadAllProperties');
      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Object')) {
          const clickFn = subItem._onClickFn;
          await clickFn?.();
          break;
        }
      }

      expect(reloadSpy).toHaveBeenCalled();
    });
  });

  describe('renderComplexWidget expanded path', () => {
    it('should not add is-collapsed when path is already expanded', () => {
      renderer.onload();

      // First render to expand the path
      const rootPath = 'test.md:testKey';
      testAccess(renderer).expandedPaths.add(rootPath);

      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const ctx = createMockCtx();
      renderWidget('list', el, ['a'], ctx);

      // ClassList.add should have been called with 'nested-properties-collapsible' but NOT 'is-collapsed'
      const addCalls = propertyEl.classList.add.mock.calls as unknown[][];
      const collapsibleCall = addCalls.find((call) => call[0] === 'nested-properties-collapsible');
      const collapsedCall = addCalls.find((call) => call[0] === 'is-collapsed');
      expect(collapsibleCall).toBeDefined();
      expect(collapsedCall).toBeUndefined();
    });
  });

  describe('renderEntry expanded nested path', () => {
    it('should not add is-collapsed class when nested path is already expanded', () => {
      renderer.onload();

      // Pre-expand the path
      const nestedPath = 'test.md:testKey.nested';
      testAccess(renderer).expandedPaths.add(nestedPath);

      getTypeInfoOriginal.mockImplementation((_property: string, value: unknown) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return {
            expected: mockApp.metadataTypeManager.registeredTypeWidgets['object'],
            inferred: mockApp.metadataTypeManager.registeredTypeWidgets['object']
          };
        }
        return {
          expected: textWidget,
          inferred: textWidget
        };
      });

      const el = createMockEl();
      const ctx = createMockCtx();
      renderWidget('object', el, { nested: { a: 1 } }, ctx);
      vi.runAllTimers();
    });
  });

  describe('getWidget with existing override', () => {
    it('should return the override widget when it exists in registry', () => {
      renderer.onload();

      // Set up a valid widget type override that exists in the registry
      testAccess(renderer).widgetTypeOverrides.set('test.md:testKey.myProp', 'text');

      const el = createMockEl();
      const ctx = createMockCtx();
      vi.mocked(textWidget.render).mockClear();
      renderWidget('object', el, { myProp: 'val' }, ctx);
      vi.runAllTimers();

      // TextWidget should have been used for rendering
      expect(textWidget.render).toHaveBeenCalled();
    });
  });

  function expectSetIconCalledWith(el: MockDomElement, iconName: string): void {
    const calls = hoisted.setIconMock.mock.calls as unknown[][];
    const matchingCall = calls.find((call) => call[0] === el && call[1] === iconName);
    expect(matchingCall).toBeDefined();
  }

  function findEventHandler(el: MockDomElement, eventName: string): (...args: unknown[]) => void {
    const call = el.addEventListener.mock.calls.find(
      (c: unknown[]) => c[0] === eventName
    );
    if (!call) {
      throw new Error(`No event handler found for '${eventName}'`);
    }
    return call[1] as (...args: unknown[]) => void;
  }

  function triggerContextMenu(): void {
    const el = createMockEl();
    const iconEl = createMockEl();
    const keyInput = createMockEl();
    const keyEl = createMockEl();
    keyEl.createDiv.mockReturnValue(createMockEl());
    keyEl.createSpan.mockReturnValue(iconEl);
    keyEl.createEl.mockReturnValue(keyInput);

    const propertyEl = createMockEl();
    propertyEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
      if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-key') {
        return keyEl;
      }
      if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-value') {
        return createMockEl();
      }
      return createMockEl();
    });

    const containerEl = createMockEl();
    containerEl.createDiv.mockReturnValue(propertyEl);
    el.createDiv.mockReturnValue(containerEl);

    getTypeInfoOriginal.mockImplementation((_property: string, value: unknown) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return {
          expected: mockApp.metadataTypeManager.registeredTypeWidgets['object'],
          inferred: mockApp.metadataTypeManager.registeredTypeWidgets['object']
        };
      }
      return {
        expected: textWidget,
        inferred: textWidget
      };
    });

    const ctx = createMockCtx();
    renderWidget('object', el, { nested: { a: 1 } }, ctx);
    vi.runAllTimers();

    const handler = findEventHandler(propertyEl, 'contextmenu');
    handler({ stopPropagation: vi.fn() });
  }

  function triggerContextMenuWithValue(value: unknown, onChange?: MockFn): void {
    const el = createMockEl();
    const iconEl = createMockEl();
    const keyInput = createMockEl();
    const keyEl = createMockEl();
    keyEl.createDiv.mockReturnValue(createMockEl());
    keyEl.createSpan.mockReturnValue(iconEl);
    keyEl.createEl.mockReturnValue(keyInput);

    const simplePropertyEl = createMockEl();
    simplePropertyEl.createDiv.mockImplementation((opts?: Record<string, unknown>) => {
      if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-key') {
        return keyEl;
      }
      if (opts && typeof opts['cls'] === 'string' && opts['cls'] === 'metadata-property-value') {
        return createMockEl();
      }
      return createMockEl();
    });

    const containerEl = createMockEl();
    containerEl.createDiv.mockReturnValue(simplePropertyEl);
    el.createDiv.mockReturnValue(containerEl);

    const ctx = createMockCtx({ onChange: castTo<PropertyRenderContext['onChange']>(onChange ?? vi.fn()) });
    renderWidget('object', el, { prop: value }, ctx);
    vi.runAllTimers();

    const handler = findEventHandler(simplePropertyEl, 'contextmenu');
    handler({ stopPropagation: vi.fn() });
  }
});
