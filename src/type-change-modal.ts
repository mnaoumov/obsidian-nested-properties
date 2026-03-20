import type { App } from 'obsidian';

import { Modal } from 'obsidian';

export class TypeChangeModal extends Modal {
  private confirmed = false;
  private resolve: ((value: boolean) => void) | undefined;
  private readonly typeName: string;

  public constructor(app: App, typeName: string) {
    super(app);
    this.typeName = typeName;
  }

  public override onClose(): void {
    this.resolve?.(this.confirmed);
  }

  public override onOpen(): void {
    this.titleEl.setText(`Display as ${this.typeName}?`);
    this.contentEl.createEl('p', {
      text: 'Your text data is not compatible. It will be adapted to fit the new format.'
    });
    const buttonContainer = this.contentEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer.createEl('button', { cls: 'mod-cta', text: 'Update' })
      .addEventListener('click', () => {
        this.confirmed = true;
        this.close();
      });
    buttonContainer.createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => {
        this.close();
      });
  }

  public waitForResult(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
}
