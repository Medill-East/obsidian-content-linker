import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface BiLink {
  keyword: string;
  count: number;
  isSelected: boolean;
}

interface IgnoredContent {
  keyword: string;
  count: number;
  isSelected: boolean;
}

export default class ContentLinkerPlugin extends Plugin {
  biLinks: BiLink[] = [];
  optionsCount: number = 10;
  ignoredContent: IgnoredContent[] = [];

  async onload() {
    await this.loadData();

    console.log('Loading Content Linker plugin');

    this.addCommand({
      id: 'search-possible-bi-links',
      name: 'Search Possible Bi-Links in Vault',
      callback: async () => {
        await this.searchPossibleBiLinks();
      },
    });

    this.addSettingTab(new ContentLinkerSettingTab(this.app, this));
  }

  async loadData() {
    this.biLinks = await this.loadDataFromLocalStorage() || [];
    this.ignoredContent = await this.loadIgnoredContentFromLocalStorage() || [];
  }

  async loadDataFromLocalStorage(): Promise<BiLink[] | null> {
    try {
      const data = window.localStorage.getItem('content-linker-plugin');
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load data from local storage', error);
    }
    return [];
  }

  async saveDataToLocalStorage(): Promise<void> {
    try {
      window.localStorage.setItem('content-linker-plugin', JSON.stringify(this.biLinks));
    } catch (error) {
      console.error('Failed to save data to local storage', error);
    }
  }

  async loadIgnoredContentFromLocalStorage(): Promise<IgnoredContent[] | null> {
    try {
      const data = window.localStorage.getItem('content-linker-ignored-content');
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load ignored content from local storage', error);
    }
    return [];
  }

  async saveIgnoredContentToLocalStorage(): Promise<void> {
    try {
      window.localStorage.setItem('content-linker-ignored-content', JSON.stringify(this.ignoredContent));
    } catch (error) {
      console.error('Failed to save ignored content to local storage', error);
    }
  }

  async searchPossibleBiLinks() {
    const vault = this.app.vault;
    const notes = vault.getMarkdownFiles();
    const existingBiLinks = new Set<string>();

    for (const note of notes) {
      const content = await vault.cachedRead(note);

      const biLinkKeywords = content.match(/\[\[(.+?)\]\]/g) || [];

      for (const biLink of biLinkKeywords) {
        const keyword = biLink.slice(2, -2);
        existingBiLinks.add(keyword);
      }
    }

    const potentialBiLinks = new Map<string, number>();

    for (const note of notes) {
      const content = await vault.cachedRead(note);

      const uniqueKeywords = content.match(/\b\w+\b/g) || [];

      for (const keyword of uniqueKeywords) {
        if (
          !potentialBiLinks.has(keyword) &&
          !this.biLinks.some((biLink) => biLink.keyword === keyword) &&
          !existingBiLinks.has(keyword) &&
          !content.includes(`[[${keyword}]]`) &&
          !this.ignoredContent.some((ignoredContent) => ignoredContent.keyword === keyword)
        ) {
          potentialBiLinks.set(keyword, 1);
        } else {
          potentialBiLinks.set(
            keyword,
            (potentialBiLinks.get(keyword) || 0) + 1
          );
        }
      }
    }

    this.biLinks = Array.from(potentialBiLinks.entries()).map(([keyword, count]) => ({
      keyword,
      count,
      isSelected: false,
    }));

    await this.saveDataToLocalStorage();

    new Notice('Search Finished!');
  }
}

class ContentLinkerSettingTab extends PluginSettingTab {
  plugin: ContentLinkerPlugin;

  constructor(app: App, plugin: ContentLinkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display() {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Content Linker Settings' });

    const searchButton = containerEl.createEl('button', {
      text: 'Search Possible Bi-Links in Vault',
    });
    searchButton.addEventListener('click', async () => {
      await this.plugin.searchPossibleBiLinks();
      this.display();
    });

    new Setting(containerEl)
      .setName('Number of Results')
      .setDesc('Enter a number:')
      .addText((text) =>
        text
          .setValue(this.plugin.optionsCount.toString())
          .onChange(async (value) => {
            const parsedValue = parseFloat(value);
            if (!isNaN(parsedValue)) {
              this.plugin.optionsCount = parsedValue;
            }
          })
      );

    const countButton = containerEl.createEl('button', {
      text: 'Update number of search results',
    });
    countButton.addEventListener('click', async () => {
      await this.plugin.searchPossibleBiLinks();
      this.display();
    });

    const table = containerEl.createEl('table', { cls: 'content-linker-table' });

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headerRow.insertCell().textContent = 'No.';
    headerRow.insertCell().textContent = 'Count';
    headerRow.insertCell().textContent = 'Keyword';
    headerRow.insertCell().textContent = 'Selected';

    const sortedBiLinks = this.plugin.biLinks
      .sort((a, b) => b.count - a.count)
      .slice(0, this.plugin.optionsCount);

    const tbody = table.createTBody();
    for (let index = 0; index < sortedBiLinks.length; index++) {
      const { keyword, count, isSelected } = sortedBiLinks[index];

      const isAlreadyBiLink = await this.isAlreadyBiLink(keyword);

      if (!isAlreadyBiLink && !this.isIgnored(keyword)) {
        const row = tbody.insertRow();
        row.insertCell().textContent = (index + 1).toString();
        row.insertCell().textContent = count.toString();
        row.insertCell().textContent = keyword;
        row.insertCell().appendChild(this.createCheckbox(keyword, isSelected));
      }
    }

    const updateButton = containerEl.createEl('button', {
      text: 'Update Bi-Link For Selected Options',
    });
    updateButton.addEventListener('click', async () => {
      await this.updateBiLinks();
      await this.plugin.searchPossibleBiLinks();
      this.display();
    });

    const ignoreButton = containerEl.createEl('button', {
      text: 'Ignore Selected Option(s)',
    });
    ignoreButton.addEventListener('click', async () => {
      await this.ignoreSelectedOptions();
    });

    this.displayIgnoredContentList();
  }

  isIgnored(keyword: string): boolean {
    return this.plugin.ignoredContent.some((ignoredContent) => ignoredContent.keyword === keyword);
  }

  async isAlreadyBiLink(keyword: string): Promise<boolean> {
    const vault = this.plugin.app.vault;
    const notes = vault.getMarkdownFiles();

    for (const note of notes) {
      const content = await vault.cachedRead(note);

      const regex = new RegExp(`\\[\\[${keyword}\\]\\]`, 'g');
      if (content.match(regex)) {
        return true;
      }
    }

    return false;
  }

  createCheckbox(keyword: string, checked: boolean): HTMLElement {
    const checkboxContainer = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkboxContainer.appendChild(checkbox);

    checkbox.addEventListener('change', async () => {
      this.plugin.biLinks = this.plugin.biLinks.map((biLink) =>
        biLink.keyword === keyword
          ? { ...biLink, isSelected: checkbox.checked }
          : biLink
      );

      await this.saveDataToLocalStorage();
    });

    return checkboxContainer;
  }

  async updateBiLinks() {
    const selectedBiLinks = this.plugin.biLinks.filter(
      (biLink) => biLink.isSelected
    );
    this.plugin.biLinks = this.plugin.biLinks.map((biLink) =>
      selectedBiLinks.some(({ keyword }) => biLink.keyword === keyword)
        ? { ...biLink, isSelected: false }
        : biLink
    );

    for (const selectedBiLink of selectedBiLinks) {
      const { keyword } = selectedBiLink;

      const vault = this.plugin.app.vault;
      const notes = vault.getMarkdownFiles();

      for (const note of notes) {
        let content = await vault.read(note);

        const regex = new RegExp(
          `\\b${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`,
          'g'
        );
        content = content.replace(regex, `[[${keyword}]]`);

        await vault.modify(note, content);
      }
    }

    await this.saveDataToLocalStorage();

    new Notice('Update Finished!');
  }

  async ignoreSelectedOptions() {
    const selectedOptions = this.plugin.biLinks.filter((biLink) => biLink.isSelected);

    for (const selectedOption of selectedOptions) {
      const { keyword } = selectedOption;

      // add selected options to ignored list
      if (!this.plugin.ignoredContent.some((ignoredContent) => ignoredContent.keyword === keyword)) {
        this.plugin.ignoredContent.push(selectedOption);
      }
    }

    // Remove the selected options from the bi-links array
    this.plugin.biLinks = this.plugin.biLinks.filter((biLink) => !biLink.isSelected);

    await this.saveIgnoredContentToLocalStorage();
    await this.saveDataToLocalStorage();

    await this.plugin.searchPossibleBiLinks();
    this.display();
  }

  async displayIgnoredContentList() {
    const { containerEl } = this;

    const ignoredContentSetting = new Setting(containerEl)
      .setName('Ignored Content List')
      .setDesc('Keywords that you want to ignore');

    const ignoredContentTable = containerEl.createEl('table', { cls: 'content-linker-ignored-content-table' });

    const ignoredContentThead = ignoredContentTable.createTHead();
    const ignoredContentHeaderRow = ignoredContentThead.insertRow();
    ignoredContentHeaderRow.insertCell().textContent = 'No.';
    ignoredContentHeaderRow.insertCell().textContent = 'Count';
    ignoredContentHeaderRow.insertCell().textContent = 'Keyword';
    ignoredContentHeaderRow.insertCell().textContent = 'Selected';

    const sortedIgnoredList = this.plugin.ignoredContent
      .sort((a, b) => b.count - a.count);

    const ignoredContentTbody = ignoredContentTable.createTBody();
    for (let i = 0; i < sortedIgnoredList.length; i++) {
      const { keyword, count, isSelected } = sortedIgnoredList[i];

      const row = ignoredContentTbody.insertRow();
      row.insertCell(0).textContent = (i + 1).toString();
      row.insertCell(1).textContent = count ? count.toString() : '';
      row.insertCell(2).textContent = keyword;
      row.insertCell(3).appendChild(this.createIgnoredCheckbox(keyword, false));
    }

    ignoredContentSetting.addExtraButton((buttonEl) => {
      buttonEl.extraSettingsEl.setText('Refresh Ignored Content');
      buttonEl.onClick(async () => {
        await this.refreshIgnoredContentList();
      });
    });

    containerEl.appendChild(ignoredContentTable);

    const removeButton = containerEl.createEl('button', {
      text: 'Remove Selected Option(s) from Ignored Content List',
    });
    removeButton.addEventListener('click', async () => {
      // Remove the selected options from the ignored content list
      this.removeFromIgnoredList();
    });
  }

  createIgnoredCheckbox(keyword: string, checked: boolean): HTMLElement {
    const checkboxContainer = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkboxContainer.appendChild(checkbox);

    checkbox.addEventListener('change', async () => {
      this.plugin.ignoredContent = this.plugin.ignoredContent.map((ignoredContent) =>
        ignoredContent.keyword === keyword ? { ...ignoredContent, isSelected: checkbox.checked } : ignoredContent
      );

      await this.saveIgnoredContentToLocalStorage();
    });

    return checkboxContainer;
  }

  async removeFromIgnoredList() {
  // Get selected ignored options
  const selectedIgnoredOptions = this.plugin.ignoredContent.filter(function(ignoredContent) {
    return ignoredContent.isSelected;
  });

  for (const selectedIgnoredOption of selectedIgnoredOptions) {
    const { keyword } = selectedIgnoredOption;

    // Remove from ignored content list
    this.plugin.ignoredContent = this.plugin.ignoredContent.filter(function(ignoredContent) {
      return ignoredContent.keyword !== keyword;
    });

    // Add back to bi-link list if it doesn't already exist
    if (!this.plugin.biLinks.some(function(biLink) {
      return biLink.keyword === keyword;
    })) {
      this.plugin.biLinks.push(selectedIgnoredOption);
    }
  }

  await this.saveIgnoredContentToLocalStorage();
  await this.saveDataToLocalStorage();

  this.display();
}

  

  async refreshIgnoredContentList() {
    await this.plugin.loadData();
    this.display();
  }

  async saveDataToLocalStorage(): Promise<void> {
    await this.plugin.saveDataToLocalStorage();
  }

  async saveIgnoredContentToLocalStorage(): Promise<void> {
    await this.plugin.saveIgnoredContentToLocalStorage();
  }
}
