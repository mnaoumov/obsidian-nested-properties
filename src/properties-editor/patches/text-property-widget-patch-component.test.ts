import type {
  PropertyRenderContext,
  PropertyWidget,
  PropertyWidgetComponentBase
} from '@obsidian-typings/obsidian-public-latest';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { TextPropertyWidgetPatchComponent } from './text-property-widget-patch-component.ts';

interface Setup {
  readonly commit: (value: unknown) => void;
  readonly context: PropertyRenderContext;
  readonly onChange: ReturnType<typeof vi.fn>;
  readonly onValueConverted: ReturnType<typeof vi.fn>;
  readonly originalRender: ReturnType<typeof vi.fn>;
  readonly textWidget: PropertyWidget;
}

describe('TextPropertyWidgetPatchComponent', () => {
  it('should commit a flow mapping as an object and report the conversion first', () => {
    const { commit, context, onChange, onValueConverted } = setup(true);
    commit('{ a: 1 }');
    expect(onChange).toHaveBeenCalledWith({ a: 1 });
    expect(onValueConverted).toHaveBeenCalledWith(context, expect.any(HTMLElement), { a: 1 });
    expect(onValueConverted.mock.invocationCallOrder[0]).toBeLessThan(onChange.mock.invocationCallOrder[0] ?? 0);
  });

  it('should commit an empty flow sequence as an empty list', () => {
    const { commit, context, onChange, onValueConverted } = setup(true);
    commit('[]');
    expect(onChange).toHaveBeenCalledWith([]);
    expect(onValueConverted).toHaveBeenCalledWith(context, expect.any(HTMLElement), []);
  });

  it('should commit ordinary text unchanged', () => {
    const { commit, onChange, onValueConverted } = setup(true);
    commit('plain');
    expect(onChange).toHaveBeenCalledWith('plain');
    expect(onValueConverted).not.toHaveBeenCalled();
  });

  it('should commit a non-string value unchanged', () => {
    const { commit, onChange, onValueConverted } = setup(true);
    commit(42);
    expect(onChange).toHaveBeenCalledWith(42);
    expect(onValueConverted).not.toHaveBeenCalled();
  });

  it('should leave a flow mapping as text when the setting is off', () => {
    const { commit, onChange, onValueConverted } = setup(false);
    commit('{ a: 1 }');
    expect(onChange).toHaveBeenCalledWith('{ a: 1 }');
    expect(onValueConverted).not.toHaveBeenCalled();
  });

  it('should pass the element and value through to the original render', () => {
    const { originalRender, textWidget } = setup(true);
    const el = createDiv();
    textWidget.render(el, 'value', createContext(vi.fn()));
    expect(originalRender).toHaveBeenLastCalledWith(el, 'value', expect.objectContaining({ key: 'key', sourcePath: 'note.md' }));
  });

  it('should restore the original render on unload', () => {
    const textWidget = createTextWidget(vi.fn());
    const originalRender = textWidget.render;
    const component = new TextPropertyWidgetPatchComponent({ isEnabled: (): boolean => true, onValueConverted: vi.fn(), textWidget });
    component.load();
    expect(textWidget.render).not.toBe(originalRender);
    component.unload();
    expect(textWidget.render).toBe(originalRender);
  });
});

function createContext(onChange: (value: unknown) => void): PropertyRenderContext {
  return castTo<PropertyRenderContext>({
    app: {},
    blur: vi.fn(),
    key: 'key',
    onChange,
    sourcePath: 'note.md'
  });
}

function createTextWidget(originalRender: ReturnType<typeof vi.fn>): PropertyWidget {
  return castTo<PropertyWidget>({
    icon: 'lucide-text',
    name: () => 'Text',
    render: originalRender,
    type: 'text',
    validate: (value: unknown) => typeof value === 'string'
  });
}

function setup(isEnabled: boolean): Setup {
  let renderedContext: null | PropertyRenderContext = null;
  const originalRender = vi.fn((_el: HTMLElement, _value: unknown, renderContext: PropertyRenderContext) => {
    renderedContext = renderContext;
    return castTo<PropertyWidgetComponentBase>({});
  });
  const textWidget = createTextWidget(originalRender);
  const onValueConverted = vi.fn();
  const component = new TextPropertyWidgetPatchComponent({ isEnabled: (): boolean => isEnabled, onValueConverted, textWidget });
  component.load();

  const onChange = vi.fn();
  const context = createContext(onChange);
  textWidget.render(createDiv(), '', context);

  return {
    commit: (value: unknown): void => {
      if (renderedContext === null) {
        throw new Error('The original render was not called');
      }
      renderedContext.onChange(value);
    },
    context,
    onChange,
    onValueConverted,
    originalRender,
    textWidget
  };
}
