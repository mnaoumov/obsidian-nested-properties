import type { App as AppOriginal } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import { TypeChangeModal } from './type-change-modal.ts';

interface ModalElements {
  contentEl: HTMLElement;
  titleEl: HTMLElement;
}

function getButton(contentEl: HTMLElement, index: number): HTMLButtonElement {
  const buttons = contentEl.querySelectorAll('button');
  const button = buttons.item(index);
  if (!button) {
    throw new Error(`Button at index ${String(index)} not found`);
  }
  return button;
}

function getElements(modal: TypeChangeModal): ModalElements {
  return castTo<ModalElements>(modal);
}

describe('TypeChangeModal', () => {
  let modal: TypeChangeModal;
  let app: AppOriginal;

  beforeEach(() => {
    app = castTo<AppOriginal>(App.createConfigured__());
    modal = new TypeChangeModal(app, 'Object');
  });

  it('should set the title on open', () => {
    modal.onOpen();
    expect(getElements(modal).titleEl.textContent).toBe('Display as Object?');
  });

  it('should resolve with true when Update is clicked', async () => {
    const resultPromise = modal.waitForResult();
    modal.onOpen();

    getButton(getElements(modal).contentEl, 0).click();

    const result = await resultPromise;
    expect(result).toBe(true);
  });

  it('should resolve with false when Cancel is clicked', async () => {
    const resultPromise = modal.waitForResult();
    modal.onOpen();

    getButton(getElements(modal).contentEl, 1).click();

    const result = await resultPromise;
    expect(result).toBe(false);
  });

  it('should resolve with false when closed without clicking any button', async () => {
    const resultPromise = modal.waitForResult();
    modal.onOpen();
    modal.onClose();

    const result = await resultPromise;
    expect(result).toBe(false);
  });
});
