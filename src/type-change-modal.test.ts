import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface MockElement {
  addEventListener(event: string, handler: () => void): void;
  children: MockElement[];
  click(): void;
  createDiv(opts?: Record<string, unknown>): MockElement;
  createEl(tag: string, opts?: Record<string, unknown>): MockElement;
  setText(text: string): void;
  text: string;
}

const ModalMock = vi.hoisted(() => {
  function createMockElement(): MockElement {
    let clickHandler: (() => void) | null = null;
    const el: MockElement = {
      addEventListener(_event: string, handler: () => void): void {
        clickHandler = handler;
      },
      children: [],
      click(): void {
        clickHandler?.();
      },
      createDiv(_opts?: Record<string, unknown>): MockElement {
        const child = createMockElement();
        el.children.push(child);
        return child;
      },
      createEl(_tag: string, opts?: Record<string, unknown>): MockElement {
        const child = createMockElement();
        if (opts && typeof opts['text'] === 'string') {
          child.text = opts['text'];
        }
        el.children.push(child);
        return child;
      },
      setText(text: string): void {
        el.text = text;
      },
      text: ''
    };
    return el;
  }

  return class ModalBase {
    public contentEl = createMockElement();
    public titleEl = createMockElement();

    public close(): void {
      this.onClose();
    }

    public onClose(): void {
      /* Overridden by subclass */
    }

    public onOpen(): void {
      /* Overridden by subclass */
    }

    public open(): void {
      this.onOpen();
    }
  };
});

vi.mock('obsidian', () => ({
  Modal: ModalMock
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { TypeChangeModal } from './type-change-modal.ts';

function getButton(contentEl: MockElement, index: number): MockElement {
  const buttonContainer = contentEl.children.at(1);
  if (!buttonContainer) {
    throw new Error('Button container not found');
  }
  const button = buttonContainer.children.at(index);
  if (!button) {
    throw new Error(`Button at index ${String(index)} not found`);
  }
  return button;
}

function getContentEl(modal: TypeChangeModal): MockElement {
  // eslint-disable-next-line no-restricted-syntax -- Accessing mock properties requires double assertion.
  return (modal as unknown as InstanceType<typeof ModalMock>).contentEl;
}

function getTitleEl(modal: TypeChangeModal): MockElement {
  // eslint-disable-next-line no-restricted-syntax -- Accessing mock properties requires double assertion.
  return (modal as unknown as InstanceType<typeof ModalMock>).titleEl;
}

describe('TypeChangeModal', () => {
  let modal: TypeChangeModal;
  const mockApp = {} as never;

  beforeEach(() => {
    modal = new TypeChangeModal(mockApp, 'Object');
  });

  it('should set the title on open', () => {
    modal.open();
    expect(getTitleEl(modal).text).toBe('Display as Object?');
  });

  it('should resolve with true when Update is clicked', async () => {
    const resultPromise = modal.waitForResult();
    modal.open();

    const updateButton = getButton(getContentEl(modal), 0);
    updateButton.click();

    const result = await resultPromise;
    expect(result).toBe(true);
  });

  it('should resolve with false when Cancel is clicked', async () => {
    const resultPromise = modal.waitForResult();
    modal.open();

    const cancelButton = getButton(getContentEl(modal), 1);
    cancelButton.click();

    const result = await resultPromise;
    expect(result).toBe(false);
  });

  it('should resolve with false when closed without clicking any button', async () => {
    const resultPromise = modal.waitForResult();
    modal.open();
    modal.close();

    const result = await resultPromise;
    expect(result).toBe(false);
  });
});
