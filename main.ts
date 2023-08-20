import { App, Editor, MarkdownView, Modal, Notice, WorkspaceLeaf, Plugin, TFile, PluginSettingTab, Setting } from 'obsidian';

interface MyPluginSettings {
  mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default'
}

export default class ContentLinkerPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'search-content',
      name: 'Search Content',
      callback: async () => {
        await this.searchContent();
      }
    });

    this.addSettingTab(new ContentLinkerSettingTab(this.app, this));
  }

  async searchContent() {
    const vault = this.app.vault;
    const files = vault.getMarkdownFiles();
    const duplicateContent = new Map();
  
    for (const file of files) {
      const content = await vault.cachedRead(file);
      const regex = /(?<=\[\[).+?(?=\]\])/g;
      const matches = content.match(regex);
  
      if (matches !== null) {
        for (const match of matches) {
          if (duplicateContent.has(match)) {
            duplicateContent.get(match).push(file.path);
          } else {
            duplicateContent.set(match, [file.path]);
          }
        }
      }
    }
  
    const options = Array.from(duplicateContent.keys()).map((key) => {
      const origins = duplicateContent.get(key).join(', ');
      return {
        content: key,
        value: key,
        description: `Add bi-directional link to: ${key}\nOrigins: ${origins}`
      };
    });
  
    const modal = new Modal(this.app);
    modal.open();
    modal.titleEl.setText('Select an option');
  
    modal.contentEl.empty();
    const listContainer = createEl('ul');
    modal.contentEl.appendChild(listContainer);
  
    for (const option of options) {
      const listItem = createEl('li');
      listContainer.appendChild(listItem);
  
      const button = createEl('button');
      button.setText(`[${option.content}]`);
      button.addEventListener('click', () => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf) {
          const activeView = activeLeaf.view;
          const newLink = `[[${option.content}]]`;
          if (activeView instanceof MarkdownView) {
            const editor = activeView.editor;
            editor?.replaceSelection(newLink);
            editor?.focus();
          }
        }
        modal.close();
      });
  
      listItem.appendChild(button);
    }
  }
  
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ContentLinkerSettingTab extends PluginSettingTab {
  plugin: ContentLinkerPlugin;

  constructor(app: App, plugin: ContentLinkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Setting #1')
      .setDesc('It\'s a secret')
      .addText(text => text
        .setPlaceholder('Enter your secret')
        .setValue(this.plugin.settings.mySetting)
        .onChange(async (value) => {
          this.plugin.settings.mySetting = value;
          await this.plugin.saveSettings();
        }));
  }
}
