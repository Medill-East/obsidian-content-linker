import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

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

interface ContentLinkerPluginSettings {
  biLinks: BiLink[];
  optionsCount: number;
  ignoredContent: IgnoredContent[];
  relativePathOfExcludedNotes: string;
}

export default class ContentLinkerPlugin extends Plugin {

  settings: ContentLinkerPluginSettings;

  /**
   * Plugin onload event handler.
   */
  async onload() {
    await this.loadSettings();

    console.log('Loading Content Linker plugin');

    this.addCommand({
      id: 'search-possible-bi-directional-links',
      name: 'Search possible bi-directional links in vault',
      callback: async () => {
        await this.searchPossibleBiLinks();
        await this.saveSettings(); // Save data after making changes
      },
    });

    this.addSettingTab(new ContentLinkerSettingTab(this.app, this));
  }

  /**
   * Load plugin data from storage.
   */
  async loadSettings() {
    this.settings = Object.assign(
      {},
      {
        biLinks: [],
        optionsCount: 10,
        ignoredContent: [],
        relativePathOfExcludedNotes: '',
      },
      await this.loadData()
    );
  }

  /**
   * Save plugin data to storage.
   */
  async saveSettings() {
    this.saveData(this.settings);
  }

  /**
   * Search for possible bi-links in the vault.
   */
  /**
 * Search for possible bi-links in the vault.
 */
async searchPossibleBiLinks() {
  const vault = this.app.vault;
  const { relativePathOfExcludedNotes, biLinks, ignoredContent } = this.settings;
  const isExcludedNote = (path: string) =>
    relativePathOfExcludedNotes !== '' && path.includes(relativePathOfExcludedNotes);

  const notes = relativePathOfExcludedNotes === ''
    ? vault.getMarkdownFiles()
    : vault.getMarkdownFiles().filter((file) => !isExcludedNote(file.path));

  const existingBiLinks = new Set<string>();
  const potentialBiLinks = new Map<string, number>();

  const processNote = async (note: TFile) => {
    try {
      const content = await vault.cachedRead(note);
      const biLinkKeywords = content.match(/\[\[(.+?)\]\]/g) || [];
      const uniqueKeywords = content.match(/[\u4e00-\u9fa5]+|\b[\w-]+\b/g) || [];

      for (const biLink of biLinkKeywords) {
        const keyword = biLink.slice(2, -2);
        existingBiLinks.add(keyword);
      }

      for (const keyword of uniqueKeywords) {
        if (
          !potentialBiLinks.has(keyword) &&
          !biLinks.some((biLink) => biLink.keyword === keyword) &&
          !existingBiLinks.has(keyword) &&
          !content.includes(`[[${keyword}]]`) &&
          !ignoredContent.some((ignored) => ignored.keyword === keyword)
        ) {
          potentialBiLinks.set(keyword, 1);
        } else {
          potentialBiLinks.set(
            keyword,
            (potentialBiLinks.get(keyword) || 0) + 1
          );
        }
      }
    } catch (error) {
      console.error(`Error processing note: ${note.name}`, error);
    }
  };

  await Promise.all(notes.map(processNote));

  this.settings.biLinks = Array.from(potentialBiLinks.entries())
    .map(([keyword, count]) => ({
      keyword,
      count,
      isSelected: false,
    }));

  await this.saveSettings();

  new Notice('Search finished!');
}

}

class ContentLinkerSettingTab extends PluginSettingTab {
  plugin: ContentLinkerPlugin;
  private notice: Notice | null = null;

  constructor(app: App, plugin: ContentLinkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display() {

    const { containerEl } = this;

    containerEl.empty();

    // containerEl.createEl('h3', { text: 'Exclude notes with relative path' });
    const relativePathExclusion = new Setting(containerEl)
      .setName('Relative path of excluded notes')
      .setDesc('Enter a relative path:')
    relativePathExclusion.addText(input => input
                                    .setPlaceholder('Relative path of exluded notes')
                                    .setValue(this.plugin.settings.relativePathOfExcludedNotes.toString())
                                    .onChange(async (value) => {
                                      this.plugin.settings.relativePathOfExcludedNotes = value
                                      await this.plugin.saveSettings();
                                    }))

    const searchButton = containerEl.createEl('button', {
      text: 'Search possible bi-directional links in vault',
    });
    searchButton.addEventListener('click', async () => {
      await this.plugin.searchPossibleBiLinks();
      await this.display();
    });

    new Setting(containerEl)
      .setName('Possible bi-directional content')
      .setDesc('Enter a number:')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.optionsCount.toString())
          .onChange(async (value) => {
            const parsedValue = parseFloat(value);
            if (!isNaN(parsedValue)) {
              this.plugin.settings.optionsCount = parsedValue;
            }
          })
      );

    const countButton = containerEl.createEl('button', {
      text: 'Update number of search results',
    });
    countButton.addEventListener('click', async () => {
      await this.plugin.searchPossibleBiLinks();
      await this.display();
    });

    this.updateTableofPossibleBiDirectionalContentTable();

    const updateButton = containerEl.createEl('button', {
      text: 'Update bi-directional link for selected option(s)',
    });
    updateButton.addEventListener('click', async () => {
      await this.updateBiLinks();
      await this.plugin.searchPossibleBiLinks();
      await this.display();
    });

    const ignoreButton = containerEl.createEl('button', {
      text: 'Ignore selected option(s)',
    });
    ignoreButton.addEventListener('click', async () => {
      await this.ignoreSelectedOptions();
    });

    await this.displayIgnoredContentList();
    await this.displayBiDirectionalLinksList();
  }

  async updateTableofPossibleBiDirectionalContentTable()
  {
    const table = this.containerEl.createEl('table', { cls: 'content-linker-table' });

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headerRow.insertCell().textContent = 'No.';
    headerRow.insertCell().textContent = 'Count';
    headerRow.insertCell().textContent = 'Keyword';
    headerRow.insertCell().textContent = 'Selected';

    const sortedBiLinks = this.plugin.settings.biLinks
      .sort((a, b) => b.count - a.count)
      .slice(0, this.plugin.settings.optionsCount);

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
  }

  /**
   * Check if a keyword is ignored.
   * @param keyword - The keyword to check.
   * @returns True if ignored, false otherwise.
   */
  isIgnored(keyword: string): boolean {
    return this.plugin.settings.ignoredContent.some(
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
      this.plugin.settings.biLinks = this.plugin.settings.biLinks.map((biLink) =>
        biLink.keyword === keyword
          ? { ...biLink, isSelected: checkbox.checked }
          : biLink
      );

      await this.plugin.saveSettings();
    });

    return checkboxContainer;
  }

  async updateBiLinks() {
    const selectedBiLinks = this.plugin.settings.biLinks.filter(
      (biLink) => biLink.isSelected
    );
  
    const vault = this.plugin.app.vault;
    const notes = vault.getMarkdownFiles();
    const totalNotes = notes.length;
  
    let indexCount = 0;
    const keywordToRegex = new Map();
  
    // Create a mapping of selected keywords to their corresponding regex patterns
    for (const selectedBiLink of selectedBiLinks) {
      const { keyword } = selectedBiLink;
      const regexPattern = `\\b${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`;
      keywordToRegex.set(keyword, new RegExp(regexPattern, 'g'));
    }
  
    for (const note of notes) {
      if (!this.isExcluded(note.path)) {
        let content = await vault.read(note);
        let updatedContent = content;
    
        for (const selectedBiLink of selectedBiLinks) {
          const { keyword } = selectedBiLink;
          const regex = keywordToRegex.get(keyword);
          if (regex) {
            updatedContent = updatedContent.replace(regex, `[[${keyword}]]`);
          }
        }
    
        if (updatedContent !== content) {
          await vault.modify(note, updatedContent);
        }
    
        indexCount++;
        this.showProgress(indexCount, totalNotes);
      }
    }
    
  
    // Update the isSelected status for selected bi-links
    this.plugin.settings.biLinks = this.plugin.settings.biLinks.map((biLink) =>
      selectedBiLinks.some(({ keyword }) => biLink.keyword === keyword)
        ? { ...biLink, isSelected: false }
        : biLink
    );
  
    await this.plugin.saveSettings();
  
    new Notice('Update finished!');
  }
  
  
  /**
   * Check if a note path is excluded.
   * @param path - The path of the note.
   * @returns True if the note path is excluded, false otherwise.
   */
  isExcluded(path: string): boolean {
    if (this.plugin.settings.relativePathOfExcludedNotes === '') return false;
  
    return path.includes(this.plugin.settings.relativePathOfExcludedNotes.toString());
  }
  

  /**
   * Ignore the selected bi-link options.
   */
  async ignoreSelectedOptions() {
    const selectedOptions = this.plugin.settings.biLinks.filter(
      (biLink) => biLink.isSelected
    );

    for (const selectedOption of selectedOptions) {
      const { keyword } = selectedOption;
      // set the isSelected status to false
      selectedOption.isSelected = false;

      // add selected options to ignored list
      if (
        !this.plugin.settings.ignoredContent.some(
          (ignoredContent) => ignoredContent.keyword === keyword
        )
      ) {
        this.plugin.settings.ignoredContent.push(selectedOption);
      }
    }

    // Remove the selected options from the bi-links array
    this.plugin.settings.biLinks = this.plugin.settings.biLinks.filter(
      (biLink) => !biLink.isSelected
    );

    await this.plugin.saveSettings();

    await this.plugin.searchPossibleBiLinks();
    await this.display();
  }

  /**
   * Display the ignored content list.
   */
  async displayIgnoredContentList() {
    const { containerEl } = this;

    const ignoredContentSetting = new Setting(containerEl)
      .setName('Ignored content list')
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

    const sortedIgnoredList = this.plugin.settings.ignoredContent.sort(
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

    containerEl.appendChild(ignoredContentTable);

    const removeButton = containerEl.createEl('button', {
      text: 'Remove selected option(s) from ignored content list',
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
      this.plugin.settings.ignoredContent = this.plugin.settings.ignoredContent.map(
        (ignoredContent) =>
          ignoredContent.keyword === keyword
            ? { ...ignoredContent, isSelected: checkbox.checked }
            : ignoredContent
      );

      await this.plugin.saveSettings();
    });

    return checkboxContainer;
  }

  /**
   * Remove the selected options from the ignored content list.
   */
  async removeFromIgnoredList() {
    // Get selected ignored options
    const selectedIgnoredOptions = this.plugin.settings.ignoredContent.filter(
      (ignoredContent) => {
        return ignoredContent.isSelected;
      }
    );

    for (const selectedIgnoredOption of selectedIgnoredOptions) {
      const { keyword } = selectedIgnoredOption;

      // Remove from ignored content list
      const index = this.plugin.settings.ignoredContent.findIndex(
        (ignoredContent) => ignoredContent.keyword === keyword
      );
      if (index !== -1) {
        this.plugin.settings.ignoredContent.splice(index, 1);
      }
    }

    await this.plugin.saveSettings();

    await this.display(); // Refresh the ignored content list
  }

  async displayBiDirectionalLinksList() {
    const { containerEl } = this;
  
    const linkedContentSetting = new Setting(containerEl)
      .setName('Linked content list')
      .setDesc('Content that is already bi-directional-linked. Count including non-bi-directional-linked format');
  
    const searchLinkedContentButton = containerEl.createEl('button', {
      text: 'Search linked content in valut (May take long time if vault is big)',
    });
    searchLinkedContentButton.addEventListener('click', async () => {
      // search already linked content in vault
      this.searchLinkedContent();
    });
  }

  async searchLinkedContent() {
    const linkedContentTable = this.containerEl.createEl('table', {
      cls: 'content-linker-linked-content-table',
    });
  
    const thead = linkedContentTable.createTHead();
    const headerRow = thead.insertRow();
    headerRow.insertCell().textContent = 'No.';
    headerRow.insertCell().textContent = 'Count';
    headerRow.insertCell().textContent = 'Keyword';
    headerRow.insertCell().textContent = 'Selected';
  
    const sortedBiLinks = this.plugin.settings.biLinks
      .sort((a, b) => b.count - a.count);
  
    const tbody = linkedContentTable.createTBody();
    const batchSize = 100; // Adjust the batch size as needed
  
    const processBatch = async (batchIndex: number) => {
      const batchStartIndex = batchIndex * batchSize;
      const batchEndIndex = Math.min(
        batchStartIndex + batchSize,
        sortedBiLinks.length
      );
  
      const batchPromises = [];
  
      for (let i = batchStartIndex; i < batchEndIndex; i++) {
        const { keyword, count, isSelected } = sortedBiLinks[i];
  
        // Check if the keyword is already a bi-link in any note
        const isAlreadyBiLink = await this.isAlreadyBiLink(keyword);
  
        if (isAlreadyBiLink && !this.isIgnored(keyword)) {
          const row = tbody.insertRow();
          row.insertCell().textContent = (i + 1).toString();
          row.insertCell().textContent = count.toString();
          row.insertCell().textContent = keyword;
          row.insertCell().appendChild(this.createCheckbox(keyword, isSelected));
        }
      }
  
      // If there are more items to process, continue with the next batch
      if (batchEndIndex < sortedBiLinks.length) {
        batchPromises.push(processBatch(batchIndex + 1));
      }
  
      await Promise.all(batchPromises);
    };
  
    // Start processing the first batch
    await processBatch(0);
  
    // All items have been processed, now update the UI
    this.containerEl.appendChild(linkedContentTable);
  
    const removeButton = this.containerEl.createEl('button', {
      text: 'Remove bi-directional links for selected option(s)\nAfter clicking the button, the setting page will be refreshed',
    });
    removeButton.classList.add('multiline-button');
    removeButton.style.height = 'auto';
    removeButton.style.whiteSpace = 'pre-line';
    removeButton.style.textAlign = 'left';
    removeButton.addEventListener('click', async () => {
      // Remove bi-directional links for selected options and refresh the setting page
      await this.removeSelectedBiLinks();
    });
  }
  
  async removeSelectedBiLinks() {
    const selectedBiLinks = this.plugin.settings.biLinks.filter(
      (biLink) => biLink.isSelected
    );
  
    // Step 1: Create a set of selected keywords
    const selectedKeywords = new Set<string>(
      selectedBiLinks.map((biLink) => biLink.keyword)
    );
  
    const vault = this.app.vault;
    const notes = this.plugin.settings.relativePathOfExcludedNotes === ''
      ? vault.getMarkdownFiles()
      : vault.getMarkdownFiles().filter(file => !file.path.includes(this.plugin.settings.relativePathOfExcludedNotes.toString()));
  
    let indexCount = 0;
  
    // Step 2: Iterate through all notes in the library
    for (const note of notes) {
      let content = await vault.read(note);
      let modified = false;
  
      // Step 3: Check if the note contains any of the selected keywords
      for (const selectedKeyword of selectedKeywords) {
        const regex = new RegExp(
          `\\[\\[${selectedKeyword}\\]\\]`,
          'g'
        );
  
        if (content.match(regex)) {
          // Step 4: Remove the bidirectional link
          content = content.replace(regex, selectedKeyword);
          modified = true;
        }
      }
  
      // Step 5: Update the note if it was modified
      if (modified) {
        await vault.modify(note, content);
        indexCount++;
        this.showProgress(indexCount, notes.length);
      }
    }
  
    // Remove the selected options from the bi-links array
    this.plugin.settings.biLinks = this.plugin.settings.biLinks.filter(
      (biLink) => !biLink.isSelected
    );
  
    await this.plugin.saveSettings();
    new Notice('Selected bi-directional links removed!');
    await this.plugin.searchPossibleBiLinks();
    await this.display();
  }  

  async showProgress(indexCount: number, totalNumber: number) {
    if (!this.notice) {
      const message = `Updating: ${indexCount} of ${totalNumber}`;
      this.notice = new Notice(message);
  
      setTimeout(() => {
        this.closeNotice();
      }, 3000);
    } else {
      this.notice.setMessage(`Updating: ${indexCount} of ${totalNumber}`);
    }
  
    if (indexCount === totalNumber) {
      new Notice('Updating finish!');
      this.closeNotice();
    }
  }
  
  async closeNotice() {
    if (this.notice) {
      this.notice.hide();
      this.notice = null;
    }
  }
}
