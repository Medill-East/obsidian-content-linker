import { App, Editor, MarkdownView, Modal, Notice, WorkspaceLeaf, Plugin, TFile, PluginSettingTab, Setting, MarkdownRenderChild } from 'obsidian';

const container = createDiv();

interface MyPluginSettings {
  mySetting: string;
  blackList: string[];
  pageSize: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default',
  blackList: [],
  pageSize: 10,
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
          if (!this.settings.blackList.includes(match)) {
            if (duplicateContent.has(match)) {
              duplicateContent.get(match).push(file.path);
            } else {
              duplicateContent.set(match, [file.path]);
            }
          }
        }
      }
    }
  
    console.log(duplicateContent); // 输出匹配到的内容和对应的文件路径
  
    const options = Array.from(duplicateContent.keys())
      .map((key) => {
        const origins = duplicateContent.get(key).join(', ');
        return {
          content: key,
          value: key,
          description: `Add bi-directional link to: ${key}\nOrigins: ${origins}`
        };
      })
      .slice(0, this.settings.pageSize);
    
    console.log(options); // 输出最终可供选择的选项
      
    const modal = new Modal(this.app);
    modal.open();
    modal.titleEl.setText('Select an option');
  
    modal.contentEl.empty();
    const listContainer = createEl('ul');
    modal.contentEl.appendChild(listContainer);
  
    if (options.length === 0) {
      const emptyNotice = createEl('p');
      emptyNotice.setText('No options available');
      listContainer.appendChild(emptyNotice);
    } else {
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
        });
    
        listItem.appendChild(button);
      }
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

    new Setting(containerEl)
      .setName('Blacklist')
      .setDesc('Enter keywords to exclude from potential links')
      .addTextArea((text) => {
        text
          .setPlaceholder('Enter keywords to blacklist')
          .setValue(this.plugin.settings.blackList.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.blackList = value.split(',').map((keyword) => keyword.trim());
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Page Size')
      .setDesc('Number of potential links to show per page')
      .addText(text => text
        .setPlaceholder('Enter page size')
        .setValue(this.plugin.settings.pageSize.toString())
        .onChange(async (value) => {
          this.plugin.settings.pageSize = parseInt(value);
          await this.plugin.saveSettings();
        }));
  }
}
