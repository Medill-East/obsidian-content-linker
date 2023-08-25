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

  /**
   * Plugin onload event handler.
   */
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

  /**
   * Load data from the vault.
   */
  async loadData() {
    this.biLinks = await this.loadDataFromVault('content-linker-plugin') || [];
    this.ignoredContent = await this.loadDataFromVault('content-linker-ignored-content') || [];
  }

  /**
   * Load data from the vault.
   * @param key - The key for the data.
   * @returns The loaded data or null if it does not exist.
   */
  async loadDataFromVault(key: string): Promise<any[] | null> {
    try {
      const content = await this.app.vault.adapter.read(key);
      if (content) {
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(`Failed to load data for key '${key}' from vault`, error);
    }
    return [];
  }

  /**
   * Save data to the vault.
   * @param key - The key for the data.
   * @param data - The data to be saved.
   */
  async saveDataToVault(key: string, data: any[]): Promise<void> {
    try {
      await this.app.vault.adapter.write(key, JSON.stringify(data));
    } catch (error) {
      console.error(`Failed to save data for key '${key}' to vault`, error);
    }
  }

  /**
   * Search for possible bi-links in the vault.
   */
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
          !this.ignoredContent.some(
            (ignoredContent) => ignoredContent.keyword === keyword
          )
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

    this.biLinks = Array.from(potentialBiLinks.entries()).map(
      ([keyword, count]) => ({
        keyword,
        count,
        isSelected: false,
      })
    );

    await this.saveDataToVault('content-linker-plugin', this.biLinks);

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

  /**
   * Check if a keyword is ignored.
   * @param keyword - The keyword to check.
   * @returns True if ignored, false otherwise.
   */
  isIgnored(keyword: string): boolean {
    return this.plugin.ignoredContent.some(
      (ignoredContent) => ignoredContent.keyword === keyword
    );
  }

  /**
   * Check if a keyword is already a bi-link in any note.
   * @param keyword - The keyword to check.
   * @returns True if it is already a bi-link, false otherwise.
   */
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

  /**
   * Create a checkbox element for a bi-link option.
   * @param keyword - The keyword for the bi-link.
   * @param checked - Whether the checkbox is selected.
   * @returns The created checkbox element.
   */
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

      await this.saveDataToVault();
    });

    return checkboxContainer;
  }

  /**
   * Update the bi-links in notes based on the selected options.
   */
  async updateBiLinks() {
    const selectedBiLinks = this.plugin.biLinks.filter(
      (biLink) => biLink.isSelected
    );
    this.plugin.biLinks = this.plugin.biLinks.map((biLink) =>
      selectedBiLinks.some(({ keyword }) => biLink.keyword === keyword)
        ? { ...biLink, isSelected: false }
        : biLink
    );

    // Display the initial progress notice
    let progressNotice = new Notice('Updating: 0 of 0');

    // Function to update the progress notice
    const updateProgressNotice = (current: number, total: number) => {
      const message = `Updating: ${current} of ${total}`;
      progressNotice.setMessage(message);
    };

    // Simulate an asynchronous operation using setTimeout
    await new Promise<void>((resolve) => {
      const delay = (ms: number) =>
        new Promise((res) => setTimeout(res, ms));

      const updateLoop = async () => {
        const vault = this.plugin.app.vault;
        const notes = vault.getMarkdownFiles();
        const totalNotes = notes.length;
        let i = 0;

        for (const selectedBiLink of selectedBiLinks) {
          const { keyword } = selectedBiLink;

          for (const note of notes) {
            let content = await vault.read(note);

            const regex = new RegExp(
              `\\b${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`,
              'g'
            );
            content = content.replace(regex, `[[${keyword}]]`);

            await vault.modify(note, content);

            i++;
            // Update progress notice
            updateProgressNotice(i, totalNotes);
            await delay(1); // Allow UI to update

            if (i % 100 == 0) {
              setTimeout(() => {
                new Notice(progressNotice.noticeEl.getText());
              }, 3000);
            }
          }
        }

        resolve();
      };

      updateLoop();
    });

    // Close the progress notice
    progressNotice.hide();

    await this.saveDataToVault();
    new Notice('Update Finished!');
  }

  /**
   * Ignore the selected bi-link options.
   */
  async ignoreSelectedOptions() {
    const selectedOptions = this.plugin.biLinks.filter(
      (biLink) => biLink.isSelected
    );

    for (const selectedOption of selectedOptions) {
      const { keyword } = selectedOption;
      // set the isSelected status to false
      selectedOption.isSelected = false;

      // add selected options to ignored list
      if (
        !this.plugin.ignoredContent.some(
          (ignoredContent) => ignoredContent.keyword === keyword
        )
      ) {
        this.plugin.ignoredContent.push(selectedOption);
      }
    }

    // Remove the selected options from the bi-links array
    this.plugin.biLinks = this.plugin.biLinks.filter(
      (biLink) => !biLink.isSelected
    );

    await this.saveIgnoredContentToVault();
    await this.saveDataToVault();

    await this.plugin.searchPossibleBiLinks();
    this.display();
  }

  /**
   * Display the ignored content list.
   */
  async displayIgnoredContentList() {
    const { containerEl } = this;

    const ignoredContentSetting = new Setting(containerEl)
      .setName('Ignored Content List')
      .setDesc('Keywords that you want to ignore');

    const ignoredContentTable = containerEl.createEl('table', {
      cls: 'content-linker-ignored-content-table',
    });

    const ignoredContentThead = ignoredContentTable.createTHead();
    const ignoredContentHeaderRow = ignoredContentThead.insertRow();
    ignoredContentHeaderRow.insertCell().textContent = 'No.';
    ignoredContentHeaderRow.insertCell().textContent = 'Count';
    ignoredContentHeaderRow.insertCell().textContent = 'Keyword';
    ignoredContentHeaderRow.insertCell().textContent = 'Selected';

    const sortedIgnoredList = this.plugin.ignoredContent.sort(
      (a, b) => b.count - a.count
    );

    const ignoredContentTbody = ignoredContentTable.createTBody();
    for (let i = 0; i < sortedIgnoredList.length; i++) {
      const { keyword, count, isSelected } = sortedIgnoredList[i];

      const row = ignoredContentTbody.insertRow();
      row.insertCell(0).textContent = (i + 1).toString();
      row.insertCell(1).textContent = count ? count.toString() : '';
      row.insertCell(2).textContent = keyword;
      row.insertCell(3).appendChild(
        this.createIgnoredCheckbox(keyword, isSelected)
      );
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

  /**
   * Create a checkbox element for an ignored option.
   * @param keyword - The keyword for the ignored option.
   * @param checked - Whether the checkbox is selected.
   * @returns The created checkbox element.
   */
  createIgnoredCheckbox(keyword: string, checked: boolean): HTMLElement {
    const checkboxContainer = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkboxContainer.appendChild(checkbox);

    checkbox.addEventListener('change', async () => {
      this.plugin.ignoredContent = this.plugin.ignoredContent.map(
        (ignoredContent) =>
          ignoredContent.keyword === keyword
            ? { ...ignoredContent, isSelected: checkbox.checked }
            : ignoredContent
      );

      await this.saveIgnoredContentToVault();
    });

    return checkboxContainer;
  }

  /**
   * Remove the selected options from the ignored content list.
   */
  async removeFromIgnoredList() {
    // Get selected ignored options
    const selectedIgnoredOptions = this.plugin.ignoredContent.filter(
      (ignoredContent) => {
        return ignoredContent.isSelected;
      }
    );

    for (const selectedIgnoredOption of selectedIgnoredOptions) {
      const { keyword } = selectedIgnoredOption;

      // Remove from ignored content list
      const index = this.plugin.ignoredContent.findIndex(
        (ignoredContent) => ignoredContent.keyword === keyword
      );
      if (index !== -1) {
        this.plugin.ignoredContent.splice(index, 1);
      }
    }

    await this.saveIgnoredContentToVault();
    await this.saveDataToVault();

    this.display(); // Refresh the ignored content list
  }

  /**
   * Refresh the ignored content list.
   */
  async refreshIgnoredContentList() {
    await this.plugin.loadData();
    this.display();
  }

  /**
   * Save the bi-links data to the vault.
   */
  async saveDataToVault() {
    await this.plugin.saveDataToVault(
      'content-linker-plugin',
      this.plugin.biLinks
    );
  }

  /**
   * Save the ignored content data to the vault.
   */
  async saveIgnoredContentToVault() {
    await this.plugin.saveDataToVault(
      'content-linker-ignored-content',
      this.plugin.ignoredContent
    );
  }
}
