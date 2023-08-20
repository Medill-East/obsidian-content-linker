import { App, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile } from 'obsidian';

interface MyPluginSettings {
  mySetting: string;
  blackList: string[];
  pageSize: number;
  searchResults: SearchResult[];
}

interface SearchResult {
  content: string;
  occurrences: {
    file: TAbstractFile;
    sentence: string | undefined;
    updatedSentence: string;
    selected: boolean;
  }[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default',
  blackList: [],
  pageSize: 10,
  searchResults: [],
};

export default class ContentLinkerPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'search-content',
      name: 'Search Possible Bi-Link in Vault',
      callback: async () => {
        await this.searchContent();
        new Notice('Search Started!');
      },
    });
    

    this.addCommand({
      id: 'clear-results',
      name: 'Clear Results',
      callback: async () => {
        await this.clearResults();
      },
    });

    this.addSettingTab(new ContentLinkerSettingTab(this.app, this));
  }

  async searchContent() {
    const vault = this.app.vault;
    const files = vault.getMarkdownFiles();
    const duplicateContent = new Map<string, { file: TAbstractFile; content: string }[]>();

    for (const file of files) {
      const content = await vault.adapter.read(file.path);
      const regex = /\[\[(.+?)\]\]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const key = match[1];
        if (duplicateContent.has(key)) {
          duplicateContent.get(key)!.push({ file, content });
        } else {
          duplicateContent.set(key, [{ file, content }]);
        }
      }
    }

    const searchResults: SearchResult[] = Array.from(duplicateContent.entries()).map(([key, matches]) => {
      const occurrences = matches.map(({ file, content }) => {
        const linkRegex = /\[(.*?)\]\((.*?)\)/g;
        const sentence = content.split('\n').find((sentence) => linkRegex.test(sentence));
        const updatedSentence = content.replace(linkRegex, `<mark>${key}</mark>`);
        let selected = false; // Declare selected as a mutable variable
        return {
          file,
          sentence,
          updatedSentence,
          selected,
        } as SearchResult['occurrences'][0];
      });

      return {
        content: key,
        occurrences,
      };
    });

    this.settings.searchResults = searchResults.filter(
      (result) => !result.occurrences.some((occurrence) => occurrence.sentence === undefined)
    );
    await this.saveSettings();

    new Notice('Search Finished!');
  }

  async updateSelectedOptions() {
    const files = this.app.vault.getFiles();

    for (const result of this.settings.searchResults) {
      for (const occurrence of result.occurrences) {
        if (occurrence.selected) {
          const file = files.find((file) => file.path === occurrence.file.path) as TFile;
          if (file) {
            const contentBefore = await this.app.vault.read(file);
            const updatedContent = contentBefore.replace(
              occurrence.sentence!,
              occurrence.updatedSentence
            );
            await this.app.vault.modify(file, updatedContent);
          }
        }
      }
    }
  }

  async clearResults() {
    this.settings.searchResults = [];
    await this.saveSettings();
    new Notice('Results Cleared!');
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
  resultsContainer: HTMLElement;

  constructor(app: App, plugin: ContentLinkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Search Possible Bi-Link in Vault')
      .setDesc('Search Possible Bi-Link in Vault')
      .addButton((button) =>
        button
          .setButtonText('Search Possible Bi-Link in Vault')
          .onClick(async () => {
            await this.plugin.searchContent();
            new Notice('Search Started!');
          })
      );

    const blackList = this.plugin.settings.blackList.join(', ');

    new Setting(containerEl)
      .setName('Blacklist')
      .setDesc('Enter keywords to exclude from potential links')
      .addTextArea((text) =>
        text
          .setPlaceholder('Enter keywords to blacklist')
          .setValue(blackList)
          .onChange(async (value) => {
            this.plugin.settings.blackList = value.split(',').map((keyword) => keyword.trim());
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Page Size')
      .setDesc('Number of potential links to show per page')
      .addText((text) =>
        text
          .setPlaceholder('Enter page size')
          .setValue(this.plugin.settings.pageSize.toString())
          .onChange(async (value) => {
            this.plugin.settings.pageSize = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    this.resultsContainer = this.containerEl.createDiv();

    this.displaySearchResults();
  }

  async displaySearchResults() {
    this.resultsContainer.empty();

    if (this.plugin.settings.searchResults.length === 0) {
      const noResultsMessage = this.resultsContainer.createEl('div');
      noResultsMessage.setText('No search results found.');
      this.resultsContainer.appendChild(noResultsMessage);
    } else {
      const searchResultsContainer = this.resultsContainer.createEl('div');

      for (const [index, { content, occurrences }] of this.plugin.settings.searchResults.entries()) {
        const searchResultContainer = searchResultsContainer.createEl('div');

        const header = searchResultContainer.createEl('h3');
        header.setText(`Search Result: ${content}`);

        const occurrencesList = searchResultContainer.createEl('ul');

        let startIndex = 0;
        let endIndex = Math.min(this.plugin.settings.pageSize, occurrences.length);

        const displayOccurrences = () => {
          occurrencesList.empty();

          for (let i = startIndex; i < endIndex; i++) {
            const { file, sentence, updatedSentence, selected } = occurrences[i];

            const listItem = this.containerEl.createEl('li');
            occurrencesList.appendChild(listItem);

            const sentenceContainer = this.containerEl.createEl('div');
            listItem.appendChild(sentenceContainer);
            sentenceContainer.setText(sentence || '');

            const updatedSentenceContainer = this.containerEl.createEl('div');
            listItem.appendChild(updatedSentenceContainer);
            updatedSentenceContainer.innerHTML = updatedSentence;

            let isSelected = selected;
            const checkbox = this.containerEl.createEl('input');
            checkbox.type = 'checkbox';
            checkbox.checked = isSelected;
            checkbox.addEventListener('change', (event) => {
              isSelected = (event.target as HTMLInputElement).checked;
              this.plugin.settings.searchResults[index].occurrences[i].selected = isSelected;
              this.plugin.saveSettings();
            });
            listItem.appendChild(checkbox);
          }
        };

        displayOccurrences();

        const previousButton = this.containerEl.createEl('button');
        previousButton.setText('Previous');
        previousButton.setAttribute('disabled', 'true');
        searchResultContainer.appendChild(previousButton);

        const nextButton = this.containerEl.createEl('button');
        nextButton.setText('Next');
        if (endIndex >= occurrences.length) {
          nextButton.setAttribute('disabled', 'true');
        }
        searchResultContainer.appendChild(nextButton);

        previousButton.addEventListener('click', () => {
          startIndex = Math.max(startIndex - this.plugin.settings.pageSize, 0);
          endIndex = Math.min(startIndex + this.plugin.settings.pageSize, occurrences.length);
          displayOccurrences();

          if (endIndex < occurrences.length) {
            nextButton.removeAttribute('disabled');
          }

          if (startIndex === 0) {
            previousButton.setAttribute('disabled', 'true');
          }
        });

        nextButton.addEventListener('click', () => {
          startIndex = Math.max(startIndex + this.plugin.settings.pageSize, 0);
          endIndex = Math.min(startIndex + this.plugin.settings.pageSize, occurrences.length);
          displayOccurrences();

          if (endIndex >= occurrences.length) {
            nextButton.setAttribute('disabled', 'true');
          }

          if (startIndex > 0) {
            previousButton.removeAttribute('disabled');
          }
        });
      }
    }

    new Setting(this.resultsContainer)
      .setName('Update Bi-Link For Selected Options')
      .setDesc('Update the selected options to bi-link')
      .addButton((button) =>
        button
          .setButtonText('Update')
          .onClick(async () => {
            await this.plugin.updateSelectedOptions();
            new Notice('Selected options updated!');
          })
      );

    new Setting(this.resultsContainer)
      .setName('Clear Results')
      .setDesc('Clear the search results')
      .addButton((button) =>
        button
          .setButtonText('Clear Results')
          .onClick(async () => {
            await this.plugin.clearResults();
            new Notice('Results Cleared!');
          })
      );
  }
}
