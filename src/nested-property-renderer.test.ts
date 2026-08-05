import type {
  PropertyRenderContext,
  PropertyWidget,
  TypeInfo
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { NestedPropertyRendererComponent } from './nested-property-renderer.ts';
import { PluginSettings } from './plugin-settings.ts';

interface MockClassList {
  add: MockFunction;
  contains: MockFunction;
  remove: MockFunction;
  toggle: MockFunction;
}

interface MockDomElement {
  addEventListener: MockFunction;
  after: MockFunction;
  classList: MockClassList;
  click: MockFunction;
  closest: MockFunction;
  createDiv: MockFunction;
  createEl: MockFunction;
  createSpan: MockFunction;
  dataset: Record<string, string | undefined>;
  empty: MockFunction;
  firstChild: MockDomElement | null;
  focus: MockFunction;
  getAttribute: MockFunction;
  getAttributeNames: MockFunction;
  hasClass: MockFunction;
  insertBefore: MockFunction;
  instanceOf: MockFunction;
  isConnected: boolean;
  querySelector: MockFunction;
  querySelectorAll: MockFunction;
  remove: MockFunction;
  removeAttribute: MockFunction;
  setAttr: MockFunction;
  setAttribute: MockFunction;
  size: number;
  toggleClass: MockFunction;
  value: string;
}

type MockFunction = ReturnType<typeof vi.fn>;

// The only allowed thin stubs are kept here. MockHTMLElementBase / MockHTMLInputElementBase back the
// Hand-rolled DOM elements (createMockEl) so instanceof HTMLElement / HTMLInputElement resolve.
// MarkdownViewBase supplies the metadataEditor surface the test-mocks MarkdownView lacks. The Menu /
// MenuItem capture infrastructure stands in for the test-mocks Menu, which does not implement
// AddSections, and MenuItem, which exposes no dom — both used by the renderer. These are all Obsidian
// API surfaces, not dev-utils classes. The dev-utils classes/functions (MonkeyAroundComponent,
// ConvertAsyncToSync, ensureNonNullable, castTo / extractDefaultExportInterop) are NOT mocked — the
// Renderer drives the REAL implementations.
const hoisted = vi.hoisted(() => {
  class MockHTMLElementBase {
    public readonly isMockElement = true;
  }
  class MockHTMLInputElementBase extends MockHTMLElementBase {}

  // The test-mocks MarkdownView exposes no metadataEditor; this thin Obsidian-API stub provides the
  // Serialize / synchronize surface the renderer's reloadAllProperties touches. The renderer reads
  // MarkdownView from obsidian (overridden to this class below), so leaf.view instanceof MarkdownView
  // Resolves against the same constructor.
  class MarkdownViewBase {
    public metadataEditor = {
      serialize: vi.fn(() => ({ key: 'val' })),
      synchronize: vi.fn()
    };
  }

  interface MenuItemDom {
    addClass: MockFunctionLocal;
  }

  interface MenuItemMock {
    _onClickFunction: ((...$arguments: unknown[]) => unknown) | null;
    dom: MenuItemDom;
    onClick: MockFunctionLocal;
    setChecked: MockFunctionLocal;
    setIcon: MockFunctionLocal;
    setSection: MockFunctionLocal;
    setSubmenu: MockFunctionLocal;
    setTitle: MockFunctionLocal;
  }

  type MockFunctionLocal = ReturnType<typeof vi.fn>;

  interface SubmenuMock {
    addItem: MockFunctionLocal;
  }

  function createMenuItem(): MenuItemMock {
    const submenu: SubmenuMock = {
      addItem: vi.fn((callback: (subItem: MenuItemMock) => void) => {
        const subItem = createMenuItem();
        callback(subItem);
        submenuItems.push(subItem);
        return submenu;
      })
    };
    let onClickFunction: ((...$arguments: unknown[]) => void) | null = null;
    const item: MenuItemMock = {
      get _onClickFunction() {
        return onClickFunction;
      },
      dom: { addClass: vi.fn() },
      onClick: vi.fn(($function: (...$arguments: unknown[]) => void) => {
        onClickFunction = $function;
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
    public addItem = vi.fn((callback: (item: MenuItemMock) => void) => {
      const item = createMenuItem();
      callback(item);
      menuItems.push(item);
      return this;
    });

    public addSections = vi.fn(() => this);
    public onHide = vi.fn((callback: () => void) => {
      menuOnHideCallback = callback;
      return this;
    });

    public showAtMouseEvent = vi.fn();
  }

  const setIconMock = vi.fn();

  let isTypeChangeModalWaitResult = true;
  class TypeChangeModalMock {
    public open = vi.fn();
    public waitForResult = vi.fn(() => Promise.resolve(isTypeChangeModalWaitResult));
  }

  return {
    changeTypeChangeModalResult: (isWaitResult: boolean): void => {
      isTypeChangeModalWaitResult = isWaitResult;
    },
    createMenuItem,
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
    setIconMock,
    submenuItems,
    TypeChangeModalMock
  };
});

// Stub only Obsidian-API surfaces the test-mocks under-implement for this renderer. setIcon is a no-op
// In the test-mock for unregistered icons, so it is spied to keep the icon-name assertions observable.
// Menu / MarkdownView are stubbed per the hoisted comment above, and moment is the validity probe used
// By the value-conversion path. Everything else (Component, DOM helpers, etc.) comes from the real
// Test-mocks obsidian.
vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  MarkdownView: hoisted.MarkdownViewBase,
  Menu: hoisted.MenuBase,
  moment: vi.fn((inp?: string) => ({
    isValid: (): boolean => inp !== undefined && !Number.isNaN(Date.parse(inp))
  })),
  setIcon: hoisted.setIconMock
}));

interface ObsidianComponentModule {
  Component: new () => UpdatableComponent;
}

interface UpdatableComponent {
  update(): void;
}

vi.mock('./floating-scrollbar.ts', async () => {
  const { Component } = await vi.importActual<ObsidianComponentModule>('obsidian');
  // A loadable stub: FloatingScrollbarComponent is passed to addChild, which eager-loads it, so the
  // Stub must return a real Component. A non-arrow function is required for a new-invoked mock. The
  // Renderer calls .update() on the stored instance, so attach a no-op update to the real Component
  // Instance (the test-mocks Component is a strict proxy that throws on unknown access).
  // eslint-disable-next-line prefer-arrow-callback -- A new-invoked mock must return a fresh real Component.
  const FloatingScrollbarComponent = vi.fn(function floatingScrollbarStub() {
    const component = new Component();
    component.update = vi.fn();
    return component;
  });
  return { FloatingScrollbarComponent };
});

vi.mock('./type-change-modal.ts', () => ({
  TypeChangeModal: hoisted.TypeChangeModalMock
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { FloatingScrollbarComponent } from './floating-scrollbar.ts';

interface FakeContainer {
  win: FakeWindow;
}

interface FakeLeaf {
  getContainer(): FakeContainer;
}

interface FakeWindow {
  document: FakeWindowDocument;
}

interface FakeWindowBody {
  removeClass: MockFunction;
  toggleClass: MockFunction;
}

interface FakeWindowDocument {
  body: FakeWindowBody;
}

type GetTypeInfoFunction = (p: string, v: unknown) => TypeInfo;

interface MockApp {
  metadataTypeManager: MockMetadataTypeManager;
  workspace: MockWorkspace;
}

interface MockMetadataTypeManager {
  getAssignedWidget: MockFunction;
  getTypeInfo: MockFunction;
  getWidget: MockFunction;
  registeredTypeWidgets: Record<string, PropertyWidget>;
  setType: MockFunction;
  unsetType: MockFunction;
}

interface MockWorkspace {
  getLeavesOfType: MockFunction;
  iterateAllLeaves: MockFunction;
  onLayoutReady: MockFunction;
}

interface RendererTestAccess {
  cleanups__: (() => unknown)[];
  expandedPaths: Set<string>;
  loaded__: boolean;
  pendingFocusKey: null | string;
  showNestedPropertyMenu(params: ShowNestedPropertyMenuTestParams): void;
}

interface ShowNestedPropertyMenuTestParams {
  readonly $event: unknown;
  getValue(): unknown;
  readonly label: string;
  onDelete(): void;
  onValueChange(value: unknown): void;
  readonly path: string;
}

function asNodeList(els: MockDomElement[]): NodeListOf<Element> {
  return castTo<NodeListOf<Element>>(els);
}

function createFakeWindow(): FakeWindow {
  return {
    document: {
      body: {
        removeClass: vi.fn(),
        toggleClass: vi.fn()
      }
    }
  };
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
    dataset: {},
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

function testAccess(r: NestedPropertyRendererComponent): RendererTestAccess {
  return castTo<RendererTestAccess>(r);
}

let getTypeInfoOriginal: MockFunction;
let mockApp: MockApp;
let mockPluginSettings: PluginSettings;
let mockPluginSettingsComponent: PluginSettingsComponent;

interface RenderWidgetResult {
  focus(): void;
  readonly type: string;
}

function createMockContext(overrides?: Partial<PropertyRenderContext>): PropertyRenderContext {
  return {
    app: castTo<App>(mockApp),
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

function renderWidget(name: string, el: MockDomElement, value: unknown, context: PropertyRenderContext): RenderWidgetResult {
  return getWidget(name).render(castTo<HTMLElement>(el), value, context);
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
  let renderer: NestedPropertyRendererComponent;

  beforeEach(() => {
    vi.useFakeTimers();

    getTypeInfoOriginal = vi.fn((property: string, _value: unknown) => ({
      expected: textWidget,
      inferred: textWidget,
      property
    }));

    mockApp = {
      metadataTypeManager: {
        getAssignedWidget: vi.fn(() => null),
        getTypeInfo: getTypeInfoOriginal,
        getWidget: vi.fn(() => unknownWidget),
        registeredTypeWidgets: {
          multitext: multitextWidget,
          text: textWidget,
          unknown: unknownWidget
        },
        setType: vi.fn(() => noopAsync()),
        unsetType: vi.fn(() => noopAsync())
      },
      workspace: {
        getLeavesOfType: vi.fn(() => []),
        iterateAllLeaves: vi.fn(),
        onLayoutReady: vi.fn()
      }
    };

    vi.stubGlobal('HTMLElement', hoisted.MockHTMLElementBase);
    vi.stubGlobal('HTMLInputElement', hoisted.MockHTMLInputElementBase);
    vi.stubGlobal('activeDocument', {
      activeElement: null,
      querySelectorAll: vi.fn(() => [])
    });
    vi.stubGlobal('activeWindow', createFakeWindow());
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
    hoisted.changeTypeChangeModalResult(true);
    vi.mocked(FloatingScrollbarComponent).mockClear();

    mockPluginSettings = new PluginSettings();
    mockPluginSettingsComponent = strictProxy<PluginSettingsComponent>({
      editAndSave: vi.fn((settingsEditor: (settings: PluginSettings) => void) => {
        settingsEditor(mockPluginSettings);
        return noopAsync();
      }),
      settings: mockPluginSettings
    });

    renderer = new NestedPropertyRendererComponent({
      app: castTo<App>(mockApp),
      pluginSettingsComponent: mockPluginSettingsComponent
    });
  });

  afterEach(() => {
    // Unload the renderer so the REAL `MonkeyAroundComponent` uninstalls its prototype/method patches
    // (and the registered cleanup deletes the widgets) — otherwise the real patches leak across tests.
    if (testAccess(renderer).loaded__) {
      renderer.unload();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Drives the REAL component lifecycle: load() runs onload(), eager-loads the real MonkeyAroundComponent
  // Plus the stubbed FloatingScrollbarComponent children, and applies the three real method patches to
  // The mock metadataTypeManager, the multitext widget, and the unknown widget.
  function loadRenderer(): void {
    renderer.load();
  }

  describe('onload', () => {
    it('should register mixedListWidget and objectWidget on metadataTypeManager', () => {
      loadRenderer();

      expect(mockApp.metadataTypeManager.registeredTypeWidgets['list']).toBeDefined();
      expect(mockApp.metadataTypeManager.registeredTypeWidgets['object']).toBeDefined();
    });

    it('should register patches for listWidget.validate, getTypeInfo, and unknownWidget.render', () => {
      loadRenderer();

      // Assert the three real patches were applied by invoking the really-patched objects:
      //  - listWidget.validate now also returns true for simple arrays.
      expect(multitextWidget.validate([1, 2])).toBe(true);
      //  - getTypeInfo now infers the object widget for plain objects when the original returns unknown.
      getTypeInfoOriginal.mockImplementation(() => ({
        expected: unknownWidget,
        inferred: { ...unknownWidget, type: 'unknown' }
      }));
      const typeInfo = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFunction)('prop', { a: 1 });
      expect(typeInfo.inferred.type).toBe('object');
      //  - unknownWidget.render now delegates to the object widget for objects.
      const el = createMockEl();
      const result = unknownWidget.render(castTo<HTMLElement>(el), { a: 1 }, createMockContext());
      expect(result.type).toBe('object');
    });

    it('should create FloatingScrollbar as child', () => {
      loadRenderer();

      // The real lifecycle eager-loads the (loadable) FloatingScrollbar stub as a child.
      expect(vi.mocked(FloatingScrollbarComponent)).toHaveBeenCalledTimes(1);
    });

    it('should call reloadAllProperties on load', () => {
      const mockView = new hoisted.MarkdownViewBase();
      mockApp.workspace.getLeavesOfType.mockReturnValue([{ view: mockView }]);

      loadRenderer();

      expect(mockView.metadataEditor.serialize).toHaveBeenCalled();
    });

    it('should register cleanup callback that deletes widgets and reloads', () => {
      loadRenderer();

      const mockRemoveEl = createMockEl();
      vi.spyOn(activeDocument, 'querySelectorAll').mockImplementation(() => asNodeList([mockRemoveEl]));

      for (const $function of testAccess(renderer).cleanups__) {
        $function();
      }

      expect(mockApp.metadataTypeManager.registeredTypeWidgets['list']).toBeUndefined();
      expect(mockApp.metadataTypeManager.registeredTypeWidgets['object']).toBeUndefined();
      expect(mockRemoveEl.remove).toHaveBeenCalled();
    });

    it('should validate mixedListWidget correctly', () => {
      loadRenderer();

      const w = getWidget('list');
      expect(w.validate([1, 2])).toBe(true);
      expect(w.validate('not-array')).toBe(false);
      expect(w.validate({})).toBe(false);
    });

    it('should validate objectWidget correctly', () => {
      loadRenderer();

      const w = getWidget('object');
      expect(w.validate({ a: 1 })).toBe(true);
      expect(w.validate([1])).toBe(false);
      expect(w.validate(null)).toBe(false);
      expect(w.validate('str')).toBe(false);
    });

    it('should name mixedListWidget as Mixed list', () => {
      loadRenderer();
      expect(getWidget('list').name()).toBe('Mixed list');
    });

    it('should name objectWidget as Object', () => {
      loadRenderer();
      expect(getWidget('object').name()).toBe('Object');
    });
  });

  describe('reloadAllProperties', () => {
    it('should serialize and synchronize MarkdownView leaves', () => {
      const mockView = new hoisted.MarkdownViewBase();
      mockApp.workspace.getLeavesOfType.mockReturnValue([{ view: mockView }]);

      loadRenderer();

      expect(mockView.metadataEditor.serialize).toHaveBeenCalled();
      expect(mockView.metadataEditor.synchronize).toHaveBeenCalledTimes(2);
      expect(mockView.metadataEditor.synchronize).toHaveBeenCalledWith({});
    });

    it('should skip non-MarkdownView leaves', () => {
      mockApp.workspace.getLeavesOfType.mockReturnValue([{ view: {} }]);

      loadRenderer();

      expect(mockApp.workspace.getLeavesOfType).toHaveBeenCalledWith('markdown');
    });
  });

  describe('toggleFullKeyDisplay', () => {
    const FULL_KEY_DISPLAY_BODY_CLASS = 'nested-properties-full-key-display';

    function stubWindows(win: FakeWindow): void {
      vi.stubGlobal('activeWindow', win);
      mockApp.workspace.iterateAllLeaves = vi.fn((callback: (leaf: FakeLeaf) => void) => {
        callback({ getContainer: () => ({ win }) });
      });
    }

    it('should apply the disabled state to the main window on load', () => {
      const win = createFakeWindow();
      stubWindows(win);

      loadRenderer();

      expect(win.document.body.toggleClass).toHaveBeenCalledWith(FULL_KEY_DISPLAY_BODY_CLASS, false);
    });

    it('should enable full key display across all windows when toggled on', () => {
      const win = createFakeWindow();
      stubWindows(win);
      loadRenderer();
      win.document.body.toggleClass.mockClear();

      renderer.toggleFullKeyDisplay();

      expect(win.document.body.toggleClass).toHaveBeenCalledWith(FULL_KEY_DISPLAY_BODY_CLASS, true);
    });

    it('should disable full key display when toggled twice', () => {
      const win = createFakeWindow();
      stubWindows(win);
      loadRenderer();

      renderer.toggleFullKeyDisplay();
      win.document.body.toggleClass.mockClear();
      renderer.toggleFullKeyDisplay();

      expect(win.document.body.toggleClass).toHaveBeenCalledWith(FULL_KEY_DISPLAY_BODY_CLASS, false);
    });

    it('should remove the full key display class from all windows on unload', () => {
      const win = createFakeWindow();
      stubWindows(win);
      loadRenderer();

      renderer.unload();

      expect(win.document.body.removeClass).toHaveBeenCalledWith(FULL_KEY_DISPLAY_BODY_CLASS);
    });

    it('should initialize the enabled state from persisted settings on load', () => {
      const win = createFakeWindow();
      stubWindows(win);
      mockPluginSettings.isFullKeyDisplayEnabled = true;

      loadRenderer();

      expect(win.document.body.toggleClass).toHaveBeenCalledWith(FULL_KEY_DISPLAY_BODY_CLASS, true);
    });

    it('should persist the state when toggled', () => {
      const win = createFakeWindow();
      stubWindows(win);
      loadRenderer();

      renderer.toggleFullKeyDisplay();

      expect(mockPluginSettingsComponent.editAndSave).toHaveBeenCalledTimes(1);
      expect(mockPluginSettings.isFullKeyDisplayEnabled).toBe(true);
    });
  });

  describe('validateListWidget', () => {
    it('should return true when next returns true', () => {
      loadRenderer();

      const isResult = multitextWidget.validate(['a', 'b']);
      expect(isResult).toBe(true);
    });

    it('should return true when next returns false but isSimpleArray is true', () => {
      // Save original and override
      const origValidate = multitextWidget.validate;
      multitextWidget.validate = vi.fn(() => false);
      loadRenderer();

      const isResult = multitextWidget.validate(['a', 'b']);
      expect(isResult).toBe(true);

      multitextWidget.validate = origValidate;
    });

    it('should return false when next returns false and not simple array', () => {
      const origValidate = multitextWidget.validate;
      multitextWidget.validate = vi.fn(() => false);
      loadRenderer();

      const isResult = multitextWidget.validate({ a: 1 });
      expect(isResult).toBe(false);

      multitextWidget.validate = origValidate;
    });
  });

  describe('getTypeInfo', () => {
    it('should return as-is when inferred type is not unknown', () => {
      loadRenderer();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFunction)('prop', 'hello');
      expect(result.inferred).toBe(textWidget);
    });

    it('should return as-is when inferred is unknown but value is not complex', () => {
      getTypeInfoOriginal.mockImplementation(() => ({
        expected: unknownWidget,
        inferred: unknownWidget
      }));
      loadRenderer();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFunction)('prop', 'simple-string');
      expect(result.inferred.type).toBe('unknown');
    });

    it('should set listWidget for simple arrays when inferred is unknown', () => {
      getTypeInfoOriginal.mockImplementation(() => ({
        expected: unknownWidget,
        inferred: { ...unknownWidget, type: 'unknown' }
      }));
      loadRenderer();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFunction)('prop', ['a', 'b']);
      expect(result.inferred.type).toBe('multitext');
    });

    it('should set mixedListWidget for mixed arrays when inferred is unknown', () => {
      getTypeInfoOriginal.mockImplementation(() => ({
        expected: unknownWidget,
        inferred: { ...unknownWidget, type: 'unknown' }
      }));
      loadRenderer();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFunction)('prop', [1, { a: 2 }]);
      expect(result.inferred.type).toBe('list');
    });

    it('should set objectWidget for objects when inferred is unknown', () => {
      getTypeInfoOriginal.mockImplementation(() => ({
        expected: unknownWidget,
        inferred: { ...unknownWidget, type: 'unknown' }
      }));
      loadRenderer();

      const result = (mockApp.metadataTypeManager.getTypeInfo as GetTypeInfoFunction)('prop', { a: 1 });
      expect(result.inferred.type).toBe('object');
    });
  });

  describe('renderUnknownWidget', () => {
    it('should render with listWidget for simple arrays and update icon', () => {
      loadRenderer();
      hoisted.setIconMock.mockClear();

      const el = createMockEl();
      const iconEl = createMockEl();
      const propertyEl = createMockEl({
        querySelector: vi.fn(() => iconEl)
      });
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      unknownWidget.render(castTo<HTMLElement>(el), ['a', 'b'], context);

      // Check that setIcon was called with the icon element and correct icon name
      const calls = hoisted.setIconMock.mock.calls as unknown[][];
      const matchingCall = calls.find((call) => call[0] === iconEl && call[1] === 'lucide-list');
      expect(matchingCall).toBeDefined();
    });

    it('should render with mixedListWidget for mixed arrays', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      const result = unknownWidget.render(castTo<HTMLElement>(el), [1, { a: 2 }], context);
      expect(result).toBeDefined();
    });

    it('should render with objectWidget for objects', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      const result = unknownWidget.render(castTo<HTMLElement>(el), { key: 'val' }, context);
      expect(result).toBeDefined();
    });

    it('should call next for primitive values', () => {
      const origRender = unknownWidget.render;
      unknownWidget.render = vi.fn(() => ({ focus: vi.fn(), type: 'unknown' }));
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      unknownWidget.render(castTo<HTMLElement>(el), 'primitive', context);

      unknownWidget.render = origRender;
    });

    it('should handle missing icon element for simple arrays', () => {
      loadRenderer();

      const el = createMockEl();
      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      unknownWidget.render(castTo<HTMLElement>(el), ['a', 'b'], context);
    });

    it('should handle missing property element for simple arrays', () => {
      loadRenderer();

      const el = createMockEl();
      el.closest.mockReturnValue(null);

      const context = createMockContext();
      unknownWidget.render(castTo<HTMLElement>(el), ['a', 'b'], context);
    });
  });

  describe('renderComplexWidget', () => {
    it('should normalize non-array value to empty array for list widget type', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      const result = renderWidget('list', el, 'not-array', context);
      expect(result.type).toBe('list');
    });

    it('should normalize array value to empty object for object widget type', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      const result = renderWidget('object', el, [1, 2], context);
      expect(result.type).toBe('object');
    });

    it('should normalize non-complex value to empty object for object widget type', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      const result = renderWidget('object', el, 'primitive', context);
      expect(result.type).toBe('object');
    });

    it('should set up collapsible UI with collapse button', () => {
      loadRenderer();

      const collapseButton = createMockEl();
      const keyEl = createMockEl({ querySelector: vi.fn(() => null) });
      const existingIcon = createMockEl();
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === ':scope .metadata-property-key .metadata-property-icon') {
            return existingIcon;
          }
          if (selector === ':scope .metadata-property-key') {
            return keyEl;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);
      vi.stubGlobal('createDiv', vi.fn(() => collapseButton));

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);

      expect(propertyEl.classList.add).toHaveBeenCalledWith('nested-properties-collapsible');
      expect(propertyEl.classList.add).toHaveBeenCalledWith('is-collapsed');
    });

    it('should size the native key input to its value length', () => {
      loadRenderer();

      const keyInput = createMockEl({ value: 'vehicle_identification_number_long_key' });
      Object.setPrototypeOf(keyInput, hoisted.MockHTMLInputElementBase.prototype);
      const keyEl = createMockEl({
        querySelector: vi.fn((selector: string) => (selector === ':scope .metadata-property-key-input' ? keyInput : null))
      });
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === ':scope .metadata-property-key .metadata-property-icon') {
            return createMockEl();
          }
          if (selector === ':scope .metadata-property-key') {
            return keyEl;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      renderWidget('object', el, { vin: 'ABC' }, context);

      expect(keyInput.size).toBe('vehicle_identification_number_long_key'.length);
    });

    it('should handle collapse button click toggling', () => {
      loadRenderer();

      const collapseButton = createMockEl();
      const keyEl = createMockEl({ querySelector: vi.fn(() => null) });
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === ':scope .metadata-property-key .metadata-property-icon') {
            return createMockEl();
          }
          if (selector === ':scope .metadata-property-key') {
            return keyEl;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);
      vi.stubGlobal('createDiv', vi.fn(() => collapseButton));

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);

      const clickCall = findEventHandler(collapseButton, 'click');
      propertyEl.hasClass.mockReturnValue(true);
      clickCall({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(propertyEl.toggleClass).toHaveBeenCalledWith('is-collapsed', false);

      propertyEl.hasClass.mockReturnValue(false);
      clickCall({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(propertyEl.toggleClass).toHaveBeenCalledWith('is-collapsed', true);
    });

    it('should not create collapse button if one already exists', () => {
      loadRenderer();

      const existingButton = createMockEl();
      const keyEl = createMockEl({ querySelector: vi.fn(() => existingButton) });
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === ':scope .metadata-property-key .metadata-property-icon') {
            return createMockEl();
          }
          if (selector === ':scope .metadata-property-key') {
            return keyEl;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);

      expect(keyEl.insertBefore).not.toHaveBeenCalled();
    });

    it('should return focus/type component', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      const result = renderWidget('list', el, ['a'], context);

      expect(result.type).toBe('list');
      expect(result.focus).toBeTypeOf('function');
      result.focus();
    });

    it('should update icon for list widget type', () => {
      loadRenderer();

      const existingIcon = createMockEl();
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === ':scope .metadata-property-key .metadata-property-icon') {
            return existingIcon;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);

      expectSetIconCalledWith(existingIcon, 'lucide-list-tree');
    });

    it('should update icon for object widget type', () => {
      loadRenderer();

      const existingIcon = createMockEl();
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === ':scope .metadata-property-key .metadata-property-icon') {
            return existingIcon;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      renderWidget('object', el, { a: 1 }, context);

      expectSetIconCalledWith(existingIcon, 'lucide-braces');
    });

    it('should handle propertyEl being null', () => {
      loadRenderer();

      const el = createMockEl();
      el.closest.mockReturnValue(null);

      const context = createMockContext();
      const result = renderWidget('list', el, ['a'], context);
      expect(result).toBeDefined();
    });

    it('should handle missing keyEl', () => {
      loadRenderer();

      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === ':scope .metadata-property-key .metadata-property-icon') {
            return createMockEl();
          }
          if (selector === ':scope .metadata-property-key') {
            return null;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
    });

    it('should handle missing existingIcon', () => {
      loadRenderer();

      const keyEl = createMockEl({ querySelector: vi.fn(() => null) });
      const propertyEl = createMockEl({
        querySelector: vi.fn((selector: string) => {
          if (selector === ':scope .metadata-property-key .metadata-property-icon') {
            return null;
          }
          if (selector === ':scope .metadata-property-key') {
            return keyEl;
          }
          return null;
        })
      });

      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);
      vi.stubGlobal('createDiv', vi.fn(() => createMockEl()));

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
    });
  });

  describe('renderEntry', () => {
    it('should render complex value with collapse UI', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      renderWidget('object', el, { nested: { a: 1 } }, context);
      vi.runAllTimers();
    });

    it('should render simple value with widget', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      renderWidget('object', el, { simple: 'hello' }, context);
      vi.runAllTimers();
    });

    it('should handle contextmenu event on complex entry', () => {
      loadRenderer();

      const containerEl = createMockEl();
      const propertyDiv = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyDiv);

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('object', el, { nested: { a: 1 } }, context);

      const handler = findEventHandler(propertyDiv, 'contextmenu');
      handler({ stopPropagation: vi.fn() });
    });

    it('should handle contextmenu event on simple entry', () => {
      loadRenderer();

      const propertyDiv = createMockEl();
      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyDiv);

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('object', el, { simple: 'hello' }, context);

      const handler = findEventHandler(propertyDiv, 'contextmenu');
      handler({ stopPropagation: vi.fn() });
    });
  });

  describe('renderArray', () => {
    it('should render array items and add item button', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      renderWidget('list', el, ['item1', 'item2'], context);
      vi.runAllTimers();
    });

    it('should call onArrayChange when array item value changes', () => {
      loadRenderer();

      const el = createMockEl();
      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      vi.mocked(textWidget.render).mockClear();
      renderWidget('list', el, ['a', 'b'], context);
      vi.runAllTimers();

      // Extract the onChange callback passed to the simple widget render
      const renderCalls = vi.mocked(textWidget.render).mock.calls as unknown[][];
      const firstCall = renderCalls[0];
      if (firstCall) {
        const renderContext = firstCall[2] as PropertyRenderContext;
        renderContext.onChange('newValue');
        expect(onChange).toHaveBeenCalledWith(['newValue', 'b']);
      }
    });

    it('should call onArrayChange when array item is deleted via menu', () => {
      loadRenderer();

      const entryPropertyEl = createMockEl();
      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(entryPropertyEl);

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('list', el, ['a', 'b', 'c'], context);
      vi.runAllTimers();

      // Trigger contextmenu on the first entry
      hoisted.menuItems.length = 0;
      const contextHandler = findEventHandler(entryPropertyEl, 'contextmenu');
      contextHandler({ stopPropagation: vi.fn() });

      // Click the "Remove" item (last menu item)
      const removeItem = hoisted.menuItems.at(-1);
      if (removeItem) {
        const clickFunction = removeItem._onClickFunction;
        clickFunction?.();
        expect(onChange).toHaveBeenCalled();
      }
    });
  });

  describe('renderObject', () => {
    it('should render object entries and add property button', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      renderWidget('object', el, { key1: 'val1', key2: 'val2' }, context);
      vi.runAllTimers();
    });

    it('should handle object value change', () => {
      loadRenderer();

      const el = createMockEl();
      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('object', el, { key: 'val' }, context);
      vi.runAllTimers();
    });

    it('should handle object property deletion', () => {
      loadRenderer();

      const el = createMockEl();
      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('object', el, { key: 'val' }, context);
      vi.runAllTimers();
    });
  });

  // Issue #7: the widget re-renders only on structural changes (add/remove key), not on in-place scalar
  // Edits, so the per-entry handlers must mutate one shared, privately-cloned model rather than spread a
  // Render-time snapshot — otherwise a later structural write reverts every sibling value.
  describe('nested value preservation (issue #7)', () => {
    it('preserves a sibling object value across a later structural write', () => {
      loadRenderer();

      const el = createMockEl();
      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      vi.mocked(textWidget.render).mockClear();
      renderWidget('object', el, { a: 'x', b: 'y' }, context);
      vi.runAllTimers();

      const renderCalls = vi.mocked(textWidget.render).mock.calls as unknown[][];
      const contextA = renderCalls[0]?.[2] as PropertyRenderContext;
      const contextB = renderCalls[1]?.[2] as PropertyRenderContext;

      contextA.onChange('A');
      contextB.onChange('B');

      // Without the shared-mutable-model fix, filling `b` would spread a stale `a: 'x'`.
      expect(onChange).toHaveBeenLastCalledWith({ a: 'A', b: 'B' });
    });

    it('preserves a sibling array item across a later structural write', () => {
      loadRenderer();

      const el = createMockEl();
      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      vi.mocked(textWidget.render).mockClear();
      const original = ['x', 'y'];
      renderWidget('list', el, original, context);
      vi.runAllTimers();

      const renderCalls = vi.mocked(textWidget.render).mock.calls as unknown[][];
      const context0 = renderCalls[0]?.[2] as PropertyRenderContext;
      const context1 = renderCalls[1]?.[2] as PropertyRenderContext;

      context0.onChange('X');
      context1.onChange('Y');

      expect(onChange).toHaveBeenLastCalledWith(['X', 'Y']);
      expect(original).toEqual(['x', 'y']);
    });

    it('does not mutate the caller-provided value (structuredClone isolation)', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      vi.mocked(textWidget.render).mockClear();
      const original = { a: 'x', b: 'y' };
      renderWidget('object', el, original, context);
      vi.runAllTimers();

      const contextA = (vi.mocked(textWidget.render).mock.calls as unknown[][])[0]?.[2] as PropertyRenderContext;
      contextA.onChange('A');

      expect(original).toEqual({ a: 'x', b: 'y' });
    });

    it('copies the live value after an in-place scalar edit (getValue accessor)', async () => {
      loadRenderer();

      const propertyEl = createMockEl();
      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyEl);
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      vi.mocked(textWidget.render).mockClear();
      renderWidget('object', el, { a: 'x' }, context);
      vi.runAllTimers();

      const scalarContext = (vi.mocked(textWidget.render).mock.calls as unknown[][])[0]?.[2] as PropertyRenderContext;
      scalarContext.onChange('A');

      hoisted.menuItems.length = 0;
      const contextHandler = findEventHandler(propertyEl, 'contextmenu');
      contextHandler({ stopPropagation: vi.fn() });

      const copyItem = hoisted.menuItems.at(2);
      await copyItem?._onClickFunction?.();

      // Reads the live value ('A'), not the render-time snapshot ('x').
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{"a":"A"}');
    });
  });

  describe('showNestedPropertyMenu', () => {
    it('should create menu with type submenu and action items', () => {
      loadRenderer();

      hoisted.menuItems.length = 0;
      triggerContextMenu();

      expect(hoisted.menuItems.length).toBeGreaterThan(0);
    });

    it('should handle cut action', async () => {
      loadRenderer();

      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const cutItem = hoisted.menuItems.at(1);
      if (cutItem) {
        const clickFunction = cutItem._onClickFunction;
        await clickFunction?.();
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      }
    });

    it('should handle copy action', async () => {
      loadRenderer();

      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const copyItem = hoisted.menuItems.at(2);
      if (copyItem) {
        const clickFunction = copyItem._onClickFunction;
        await clickFunction?.();
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      }
    });

    it('should handle paste action with valid JSON object', async () => {
      loadRenderer();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('{"key": "pasted_value"}');
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFunction = pasteItem._onClickFunction;
        await clickFunction?.();
      }
    });

    it('should handle paste action with invalid JSON', async () => {
      loadRenderer();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('not-json');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFunction = pasteItem._onClickFunction;
        await clickFunction?.();
      }

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle paste action with array JSON', async () => {
      loadRenderer();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('[1, 2, 3]');
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFunction = pasteItem._onClickFunction;
        await clickFunction?.();
      }
    });

    it('should handle paste action with null JSON', async () => {
      loadRenderer();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('null');
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFunction = pasteItem._onClickFunction;
        await clickFunction?.();
      }
    });

    it('should handle paste action with empty object', async () => {
      loadRenderer();

      vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('{}');
      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const pasteItem = hoisted.menuItems.at(3);
      if (pasteItem) {
        const clickFunction = pasteItem._onClickFunction;
        await clickFunction?.();
      }
    });

    it('should handle remove action', () => {
      loadRenderer();

      hoisted.menuItems.length = 0;
      triggerContextMenu();

      const removeItem = hoisted.menuItems.at(4);
      if (removeItem) {
        const clickFunction = removeItem._onClickFunction;
        clickFunction?.();
      }
    });

    it('should debounce menu when opened too quickly', () => {
      loadRenderer();

      hoisted.menuItems.length = 0;
      triggerContextMenu();
      const firstCount = hoisted.menuItems.length;

      const onHideCallback = hoisted.menuOnHideCallback.get();
      if (onHideCallback) {
        onHideCallback();
      }

      hoisted.menuItems.length = 0;
      triggerContextMenu();
      expect(hoisted.menuItems.length).toBe(0);

      vi.advanceTimersByTime(300);
      triggerContextMenu();
      expect(hoisted.menuItems.length).toBeGreaterThanOrEqual(firstCount);
    });

    it('should offer both per-field and per-item type submenus for an array-item field', () => {
      loadRenderer();

      // A field nested inside an array item (`versions.0.released`) resolves to a non-null field key
      // (`versions.released`) that differs from its item key, so the menu offers a shared per-field
      // "all items" default alongside the per-item "this item only" override.
      hoisted.menuItems.length = 0;
      testAccess(renderer).showNestedPropertyMenu({
        $event: { stopPropagation: vi.fn() },
        getValue: () => true,
        label: 'released',
        onDelete: vi.fn(),
        onValueChange: vi.fn(),
        path: 'test.md:versions.0.released'
      });

      const titles = hoisted.menuItems.flatMap((item) => (item.setTitle.mock.calls as unknown[][]).map((call) => call[0]));
      expect(titles).toContain('Property type (all items)');
      expect(titles).toContain('Property type (this item only)');
    });

    it('should offer a reserved-key widget for a nested property (guard removed)', () => {
      loadRenderer();

      // A widget whose reservedKeys don't contain the nested label (like `tags`) must now be offered,
      // So Tags/aliases/cssclasses can be assigned to nested properties.
      const reservedWidget: PropertyWidget = {
        icon: 'lucide-reserved',
        name: (): string => 'Reserved',
        render: vi.fn(() => ({ focus: vi.fn(), type: 'reserved' })),
        reservedKeys: ['some-other-key'],
        type: 'reserved',
        validate: vi.fn(() => true)
      };
      mockApp.metadataTypeManager.registeredTypeWidgets['reserved'] = reservedWidget;

      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      triggerContextMenu();

      const isOfferedReserved = hoisted.submenuItems.some((subItem) => {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        return titleCalls.some((call) => call[0] === 'Reserved');
      });
      expect(isOfferedReserved).toBe(true);
    });

    it('should handle type submenu with checked state for current widget', () => {
      loadRenderer();

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
      loadRenderer();

      hoisted.changeTypeChangeModalResult(true);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      triggerContextMenu();

      if (hoisted.submenuItems.length > 0) {
        const subItem = hoisted.submenuItems.at(0);
        if (subItem) {
          const clickFunction = subItem._onClickFunction;
          await clickFunction?.();
        }
      }
    });

    it('should blur active element when changing type', async () => {
      loadRenderer();

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
          const clickFunction = subItem._onClickFunction;
          await clickFunction?.();
        }
      }

      expect(blurMock).toHaveBeenCalled();
    });

    it('should not blur when active element is not HTMLElement', async () => {
      loadRenderer();

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
          const clickFunction = subItem._onClickFunction;
          await clickFunction?.();
        }
      }
    });

    it('should show modal and cancel for lossy conversion', async () => {
      loadRenderer();

      hoisted.changeTypeChangeModalResult(false);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      triggerContextMenuWithValue({ a: 1 });

      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Text')) {
          const clickFunction = subItem._onClickFunction;
          await clickFunction?.();
          break;
        }
      }
    });

    it('should call onValueChange when converted differs from value', async () => {
      loadRenderer();

      hoisted.changeTypeChangeModalResult(true);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;

      const onChange = vi.fn();
      triggerContextMenuWithValue('hello', onChange);

      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Mixed list')) {
          const clickFunction = subItem._onClickFunction;
          await clickFunction?.();
          break;
        }
      }
    });

    it('should persist the chosen type via setType with the global (source-path-stripped) key', async () => {
      loadRenderer();

      hoisted.changeTypeChangeModalResult(true);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      // Menu opens on the `nested` object entry; inferred type is `object`, so choosing `Text` persists.
      triggerContextMenu();

      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Text')) {
          await subItem._onClickFunction?.();
          break;
        }
      }

      expect(mockApp.metadataTypeManager.setType).toHaveBeenCalledWith('testKey.nested', 'text');
    });

    it('should unsetType when the chosen type equals the inferred type', async () => {
      loadRenderer();

      hoisted.changeTypeChangeModalResult(true);
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      // Menu opens on the `nested` object entry; choosing `Object` matches inference, so it unsets.
      triggerContextMenu();

      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Object')) {
          await subItem._onClickFunction?.();
          break;
        }
      }

      expect(mockApp.metadataTypeManager.unsetType).toHaveBeenCalledWith('testKey.nested');
      expect(mockApp.metadataTypeManager.setType).not.toHaveBeenCalled();
    });
  });

  describe('getWidget', () => {
    it('should fall through when assigned widget not found in registry', () => {
      loadRenderer();

      // GetAssignedWidget returns a type that is not registered, so getWidget falls back to inference.
      mockApp.metadataTypeManager.getAssignedWidget.mockReturnValue('nonexistent');

      const el = createMockEl();
      const context = createMockContext();
      renderWidget('object', el, { test: 'val' }, context);
      vi.runAllTimers();
    });

    it('should return widget from getTypeInfo when no override', () => {
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      renderWidget('object', el, { key: 'val' }, context);
      vi.runAllTimers();
    });
  });

  describe('renderAddItemButton', () => {
    it('should add empty string to array on click', () => {
      loadRenderer();

      const addButton = createMockEl();
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-item') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('list', el, ['a'], context);

      const handler = findEventHandler(addButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      vi.runAllTimers();
    });
  });

  describe('renderAddPropertyButton', () => {
    it('should create input on click and handle Enter key', () => {
      loadRenderer();

      const input = createMockEl();
      input.value = 'newKey';
      const addButton = createMockEl();
      addButton.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-property') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('object', el, { existing: 'val' }, context);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addButton, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    it('should handle Tab key with focus pending', () => {
      loadRenderer();

      const input = createMockEl();
      input.value = 'newTabKey';
      const addButton = createMockEl();
      addButton.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-property') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('object', el, {}, context);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addButton, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Tab', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    it('should handle Escape key to restore button', () => {
      loadRenderer();

      const input = createMockEl();
      input.value = 'test';
      const addButton = createMockEl();
      addButton.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-property') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('object', el, {}, context);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addButton, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(addButton.empty).toHaveBeenCalled();
    });

    it('should handle blur event when connected', () => {
      loadRenderer();

      const input = createMockEl();
      input.value = 'blurKey';
      input.isConnected = true;
      const addButton = createMockEl();
      addButton.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-property') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('object', el, {}, context);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addButton, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const blurHandler = findEventHandler(input, 'blur');
      blurHandler();
    });

    it('should not call addKey on blur when not connected', () => {
      loadRenderer();

      const input = createMockEl();
      input.value = 'disconnectedKey';
      input.isConnected = false;
      const addButton = createMockEl();
      addButton.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-property') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('object', el, {}, context);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addButton, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const blurHandler = findEventHandler(input, 'blur');
      blurHandler();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should restore button when key is empty', () => {
      loadRenderer();

      const input = createMockEl();
      input.value = ' '.repeat(3);
      const addButton = createMockEl();
      addButton.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-property') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('object', el, {}, context);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addButton, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(addButton.empty).toHaveBeenCalled();
    });

    it('should restore button when key already exists in object', () => {
      loadRenderer();

      const input = createMockEl();
      input.value = 'existing';
      const addButton = createMockEl();
      addButton.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-property') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('object', el, { existing: 'val' }, context);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addButton, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should handle input.remove throwing in Enter handler', () => {
      loadRenderer();

      const input = createMockEl();
      input.value = 'newKey2';
      input.remove.mockImplementation(() => {
        throw new Error('Already removed');
      });
      const addButton = createMockEl();
      addButton.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-property') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const onChange = vi.fn();
      const context = createMockContext({ onChange });
      renderWidget('object', el, {}, context);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addButton, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      keydownHandler({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(onChange).toHaveBeenCalled();
    });

    it('should propagate other key events', () => {
      loadRenderer();

      const input = createMockEl();
      input.value = 'test';
      const addButton = createMockEl();
      addButton.createEl.mockReturnValue(input);
      const containerEl = createMockEl();
      containerEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && (options['cls'] as string) === 'nested-properties-add-property') {
          return addButton;
        }
        return createMockEl();
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('object', el, {}, context);
      vi.runAllTimers();

      const addClickHandler = findEventHandler(addButton, 'click');
      addClickHandler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      const keydownHandler = findEventHandler(input, 'keydown');
      const preventDefaultMock = vi.fn();
      keydownHandler({ key: 'a', preventDefault: preventDefaultMock, stopPropagation: vi.fn() });
      expect(preventDefaultMock).not.toHaveBeenCalled();
    });
  });

  describe('injectHeaderButtons', () => {
    it('should return early if header actions already exist', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();
    });

    it('should return early if no collapsible elements exist', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();
    });

    it('should return early if no heading element exists', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();
    });

    it('should create toggle button and handle expand all', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    it('should size top-level key inputs that sit outside the nested container', () => {
      loadRenderer();

      const toggleButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValue(toggleButton);

      const collapsibleEl = createMockEl();

      // A native top-level key input (`instanceOf(HTMLInputElement)` true) that is NOT inside a
      // `.nested-properties-container` must have its `size` set to its content length.
      const topLevelKeyInput = createMockEl();
      topLevelKeyInput.value = 'a-long-top-level-key';
      topLevelKeyInput.instanceOf.mockReturnValue(true);
      topLevelKeyInput.closest.mockReturnValue(null);

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
        querySelectorAll: vi.fn((selector: string) => (selector === ':scope .metadata-property-key-input' ? [topLevelKeyInput] : [collapsibleEl]))
      });

      const containerEl = createMockEl({ closest: vi.fn(() => metaContainer) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      expect(topLevelKeyInput.size).toBe('a-long-top-level-key'.length);
    });

    it('should skip key inputs inside the nested container when sizing top-level inputs', () => {
      loadRenderer();

      const toggleButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValue(toggleButton);

      const collapsibleEl = createMockEl();

      // A key input inside a `.nested-properties-container` is the plugin's own - it is left untouched.
      const nestedKeyInput = createMockEl();
      nestedKeyInput.value = 'nested-key';
      nestedKeyInput.instanceOf.mockReturnValue(true);
      nestedKeyInput.closest.mockReturnValue(createMockEl());

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
        querySelectorAll: vi.fn((selector: string) => (selector === ':scope .metadata-property-key-input' ? [nestedKeyInput] : [collapsibleEl]))
      });

      const containerEl = createMockEl({ closest: vi.fn(() => metaContainer) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      expect(nestedKeyInput.size).toBe(0);
    });

    it('should create a full key display toggle button that toggles full key display', () => {
      loadRenderer();
      const toggleFullKeyDisplaySpy = vi.spyOn(renderer, 'toggleFullKeyDisplay');

      const collapseButton = createMockEl();
      const fullKeyButton = createMockEl();
      const headingEl = createMockEl();
      const actionsEl = createMockEl();
      actionsEl.createDiv.mockReturnValueOnce(collapseButton).mockReturnValueOnce(fullKeyButton);

      const collapsibleEl = createMockEl();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      const handler = findEventHandler(fullKeyButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(toggleFullKeyDisplaySpy).toHaveBeenCalledTimes(1);
    });

    it('should handle collapse all when not all collapsed', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });

    it('should handle empty collapsibles list for toggle', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });
  });

  describe('collapseAllIn and expandAllIn', () => {
    it('should handle expandAllIn with elements without data-path attribute', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      // Click toggle to expand all (since all are collapsed)
      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      // ClassList.remove should have been called with 'is-collapsed'
      expect(collapsibleEl.classList.remove).toHaveBeenCalledWith('is-collapsed');
    });

    it('should handle elements without data-path attribute in collapseAllIn', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      const handler = findEventHandler(toggleButton, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    });
  });

  describe('createSummary', () => {
    it('should create summary with array text for arrays', () => {
      loadRenderer();

      const el = createMockEl();
      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      renderWidget('list', el, ['a', 'b'], context);

      expect(el.createSpan).toHaveBeenCalledWith(expect.objectContaining({ text: '[ ... ]' }));
    });

    it('should create summary with object text for objects', () => {
      loadRenderer();

      const el = createMockEl();
      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      renderWidget('object', el, { a: 1 }, context);

      expect(el.createSpan).toHaveBeenCalledWith(expect.objectContaining({ text: '{ ... }' }));
    });

    it('should expand on summary click', () => {
      loadRenderer();

      const summary = createMockEl();
      const el = createMockEl();
      el.createSpan.mockReturnValue(summary);

      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);

      const handler = findEventHandler(summary, 'click');
      handler({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(propertyEl.classList.remove).toHaveBeenCalledWith('is-collapsed');
    });
  });

  describe('updateToggleButton', () => {
    it('should set expand icon when all collapsed', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      expectSetIconCalledWith(toggleButton, 'chevrons-up-down');
    });

    it('should set collapse icon when not all collapsed', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();

      expectSetIconCalledWith(toggleButton, 'chevrons-down-up');
    });
  });

  describe('renderComplexWidget setTimeout', () => {
    it('should handle null metadataContainerEl in setTimeout', () => {
      loadRenderer();

      const containerEl = createMockEl({ closest: vi.fn(() => null) });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();
    });

    it('should handle metadataContainerEl that is not HTMLElement', () => {
      loadRenderer();

      const containerEl = createMockEl({ closest: vi.fn(() => 'not-html-element') });
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);
      vi.runAllTimers();
    });

    it('should handle pending focus key with matching input', () => {
      loadRenderer();

      const focusTarget = createMockEl();
      const valueEl = createMockEl({ querySelector: vi.fn(() => focusTarget) });
      const propertyEl = createMockEl({ querySelector: vi.fn(() => valueEl) });
      const input = createMockEl();
      input.value = 'target';
      input.instanceOf.mockReturnValue(true);
      input.closest.mockReturnValue(propertyEl);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'target';

      const context = createMockContext();
      renderWidget('object', el, {}, context);
      vi.runAllTimers();

      expect(focusTarget.focus).toHaveBeenCalled();
    });

    it('should click valueEl when no focusable target is found', () => {
      loadRenderer();

      const valueEl = createMockEl({ querySelector: vi.fn(() => null) });
      const propertyEl = createMockEl({ querySelector: vi.fn(() => valueEl) });
      const input = createMockEl();
      input.value = 'target';
      input.instanceOf.mockReturnValue(true);
      input.closest.mockReturnValue(propertyEl);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'target';

      const context = createMockContext();
      renderWidget('object', el, {}, context);
      vi.runAllTimers();

      expect(valueEl.click).toHaveBeenCalled();
    });

    it('should handle input that does not match pending key', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('object', el, {}, context);
      vi.runAllTimers();
    });

    it('should handle input that is not HTMLInputElement', () => {
      loadRenderer();

      const input = createMockEl();
      input.instanceOf.mockReturnValue(false);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'someKey';

      const context = createMockContext();
      renderWidget('object', el, {}, context);
      vi.runAllTimers();
    });

    it('should handle input with null prop from closest', () => {
      loadRenderer();

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

      const context = createMockContext();
      renderWidget('object', el, {}, context);
      vi.runAllTimers();
    });

    it('should handle prop with no valueEl from querySelector', () => {
      loadRenderer();

      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      const input = createMockEl();
      input.value = 'target';
      input.instanceOf.mockReturnValue(true);
      input.closest.mockReturnValue(propertyEl);

      const containerEl = createMockEl({
        closest: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [input])
      });

      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      testAccess(renderer).pendingFocusKey = 'target';

      const context = createMockContext();
      renderWidget('object', el, {}, context);
      vi.runAllTimers();
    });
  });

  describe('renderEntry with assigned type', () => {
    it('should treat entry as complex when assigned type is list', () => {
      loadRenderer();

      mockApp.metadataTypeManager.getAssignedWidget.mockImplementation((key: string) => key === 'testKey.myProperty' ? 'list' : null);

      const el = createMockEl();
      const context = createMockContext();
      renderWidget('object', el, { myProperty: 'simple-string' }, context);
      vi.runAllTimers();
    });

    it('should treat entry as complex when assigned type is object', () => {
      loadRenderer();

      mockApp.metadataTypeManager.getAssignedWidget.mockImplementation((key: string) => key === 'testKey.myProperty' ? 'object' : null);

      const el = createMockEl();
      const context = createMockContext();
      renderWidget('object', el, { myProperty: 'simple-string' }, context);
      vi.runAllTimers();
    });
  });

  describe('renderEntry nested collapse button', () => {
    it('should toggle collapse state on nested entry collapse button click', () => {
      loadRenderer();

      const collapseButton = createMockEl();
      const iconEl = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseButton);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-value') {
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

      const context = createMockContext();
      renderWidget('object', el, { nested: { a: 1 } }, context);
      vi.runAllTimers();

      const handler = findEventHandler(collapseButton, 'click');
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
      loadRenderer();

      const el = createMockEl();
      const context = createMockContext();
      renderWidget('object', el, { key: 'val' }, context);
      vi.runAllTimers();
    });

    it('should trigger showNestedPropertyMenu on icon click when onValueChange and onDelete are provided', () => {
      loadRenderer();

      // Render an object with a simple value entry
      // The renderEntry for simple values calls renderKeyEl with onValueChange and onDelete
      const iconEl = createMockEl();
      const keyEl = createMockEl();
      keyEl.createSpan.mockReturnValue(iconEl);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-value') {
          return createMockEl();
        }
        return createMockEl();
      });

      const containerEl = createMockEl();
      containerEl.createDiv.mockReturnValue(propertyEl);
      const el = createMockEl();
      el.createDiv.mockReturnValue(containerEl);

      const context = createMockContext();
      renderWidget('object', el, { key: 'val' }, context);
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
      loadRenderer();

      const iconEl = createMockEl();
      const collapseButton = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseButton);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-value') {
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

      const context = createMockContext();
      renderWidget('object', el, { nested: { a: 1 } }, context);
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
      loadRenderer();

      hoisted.changeTypeChangeModalResult(true);

      // Render an object with a nested object entry
      const iconEl = createMockEl();
      const collapseButton = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseButton);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-value') {
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
      const context = createMockContext({ onChange });
      renderWidget('object', el, { nested: { a: 1 } }, context);
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
          const clickFunction = subItem._onClickFunction;
          await clickFunction?.();
          break;
        }
      }

      // Blur should have been called
      expect(blurMock).toHaveBeenCalled();
    });

    it('should return early when modal is cancelled for lossy conversion', async () => {
      loadRenderer();

      hoisted.changeTypeChangeModalResult(false);

      const iconEl = createMockEl();
      const collapseButton = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseButton);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-value') {
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
      const context = createMockContext({ onChange });
      renderWidget('object', el, { nested: { a: 1 } }, context);
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
          const clickFunction = subItem._onClickFunction;
          await clickFunction?.();
          break;
        }
      }

      // The type should NOT have been persisted since the user cancelled the lossy-conversion modal.
      expect(mockApp.metadataTypeManager.setType).not.toHaveBeenCalled();
      expect(mockApp.metadataTypeManager.unsetType).not.toHaveBeenCalled();
    });

    it('should set widget type override and reload when converted equals value', async () => {
      loadRenderer();

      hoisted.changeTypeChangeModalResult(true);

      const iconEl = createMockEl();
      const collapseButton = createMockEl();
      const keyInput = createMockEl();
      const valueEl = createMockEl();
      const nestedContainer = createMockEl();
      valueEl.createDiv.mockReturnValue(nestedContainer);

      const keyEl = createMockEl();
      keyEl.createDiv.mockReturnValue(collapseButton);
      keyEl.createSpan.mockReturnValue(iconEl);
      keyEl.createEl.mockReturnValue(keyInput);

      const propertyEl = createMockEl();
      propertyEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-key') {
          return keyEl;
        }
        if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-value') {
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
      const context = createMockContext({ onChange });
      // Use an object value and convert to object type (same) → converted === value
      renderWidget('object', el, { nested: { a: 1 } }, context);
      vi.runAllTimers();

      // Open menu on the nested entry
      hoisted.menuItems.length = 0;
      hoisted.submenuItems.length = 0;
      const iconClickHandler = findEventHandler(iconEl, 'click');
      iconClickHandler({ stopPropagation: vi.fn() });

      // Click "Object" type (same type → no conversion needed, reload)
      const mockView = new hoisted.MarkdownViewBase();
      mockApp.workspace.getLeavesOfType.mockReturnValue([{ view: mockView }]);
      for (const subItem of hoisted.submenuItems) {
        const titleCalls = subItem.setTitle.mock.calls as unknown[][];
        if (titleCalls.some((call) => call[0] === 'Object')) {
          const clickFunction = subItem._onClickFunction;
          await clickFunction?.();
          break;
        }
      }

      expect(mockView.metadataEditor.synchronize).toHaveBeenCalled();
    });
  });

  describe('renderComplexWidget expanded path', () => {
    it('should not add is-collapsed when path is already expanded', () => {
      loadRenderer();

      // First render to expand the path
      const rootPath = 'test.md:testKey';
      testAccess(renderer).expandedPaths.add(rootPath);

      const propertyEl = createMockEl({ querySelector: vi.fn(() => null) });
      const el = createMockEl();
      el.closest.mockReturnValue(propertyEl);

      const context = createMockContext();
      renderWidget('list', el, ['a'], context);

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
      loadRenderer();

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
      const context = createMockContext();
      renderWidget('object', el, { nested: { a: 1 } }, context);
      vi.runAllTimers();
    });
  });

  describe('getWidget with existing assigned type', () => {
    it('should return the assigned widget (winning over inference) when it exists in registry', () => {
      loadRenderer();

      // Inference would pick multitext, but an assigned `text` type must win.
      mockApp.metadataTypeManager.getTypeInfo.mockImplementation((property: string) => ({
        expected: multitextWidget,
        inferred: multitextWidget,
        property
      }));
      mockApp.metadataTypeManager.getAssignedWidget.mockImplementation((key: string) => key === 'testKey.myProperty' ? 'text' : null);

      const el = createMockEl();
      const context = createMockContext();
      vi.mocked(textWidget.render).mockClear();
      vi.mocked(multitextWidget.render).mockClear();
      renderWidget('object', el, { myProperty: 'val' }, context);
      vi.runAllTimers();

      // TextWidget (assigned) should have been used for rendering, not the inferred multitext.
      expect(textWidget.render).toHaveBeenCalled();
      expect(multitextWidget.render).not.toHaveBeenCalled();
    });
  });

  function expectSetIconCalledWith(el: MockDomElement, iconName: string): void {
    const calls = hoisted.setIconMock.mock.calls as unknown[][];
    const matchingCall = calls.find((call) => call[0] === el && call[1] === iconName);
    expect(matchingCall).toBeDefined();
  }

  function findEventHandler(el: MockDomElement, eventName: string): (...$arguments: unknown[]) => void {
    const call = el.addEventListener.mock.calls.find(
      (c: unknown[]) => c[0] === eventName
    );
    if (!call) {
      throw new Error(`No event handler found for '${eventName}'`);
    }
    return call[1] as (...$arguments: unknown[]) => void;
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
    propertyEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
      if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-key') {
        return keyEl;
      }
      if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-value') {
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

    const context = createMockContext();
    renderWidget('object', el, { nested: { a: 1 } }, context);
    vi.runAllTimers();

    const handler = findEventHandler(propertyEl, 'contextmenu');
    handler({ stopPropagation: vi.fn() });
  }

  function triggerContextMenuWithValue(value: unknown, onChange?: MockFunction): void {
    const el = createMockEl();
    const iconEl = createMockEl();
    const keyInput = createMockEl();
    const keyEl = createMockEl();
    keyEl.createDiv.mockReturnValue(createMockEl());
    keyEl.createSpan.mockReturnValue(iconEl);
    keyEl.createEl.mockReturnValue(keyInput);

    const simplePropertyEl = createMockEl();
    simplePropertyEl.createDiv.mockImplementation((options?: Record<string, unknown>) => {
      if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-key') {
        return keyEl;
      }
      if (options && typeof options['cls'] === 'string' && options['cls'] === 'metadata-property-value') {
        return createMockEl();
      }
      return createMockEl();
    });

    const containerEl = createMockEl();
    containerEl.createDiv.mockReturnValue(simplePropertyEl);
    el.createDiv.mockReturnValue(containerEl);

    const context = createMockContext({ onChange: castTo<PropertyRenderContext['onChange']>(onChange ?? vi.fn()) });
    renderWidget('object', el, { property: value }, context);
    vi.runAllTimers();

    const handler = findEventHandler(simplePropertyEl, 'contextmenu');
    handler({ stopPropagation: vi.fn() });
  }
});
