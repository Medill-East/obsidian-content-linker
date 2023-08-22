import { App, Notice, Plugin, PluginSettingTab } from 'obsidian';

interface BiLink {
  keyword: string;
  count: number;
  isSelected: boolean;
}

export default class ContentLinkerPlugin extends Plugin {
  biLinks: BiLink[];

  async onload() {
    await this.loadData();

    console.log('Loading Content Linker plugin');

    // Register a command to search for possible bi-links in vault
    this.addCommand({
      id: 'search-possible-bi-links',
      name: 'Search Possible Bi-Links in Vault',
      callback: async () => {
        await this.searchPossibleBiLinks();
      },
    });

    // Add a setting tab
    this.addSettingTab(new ContentLinkerSettingTab(this.app, this));
  }

  async loadData() {
    this.biLinks = await this.loadDataFromLocalStorage() || [];
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

  async saveDataToLocalStorage(data: BiLink[]): Promise<void> {
    try {
      window.localStorage.setItem('content-linker-plugin', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save data to local storage', error);
    }
  }

  async searchPossibleBiLinks() {
    const vault = this.app.vault;
    const notes = vault.getMarkdownFiles();
  
    // Store all potential bi-link keywords and their counts
    const potentialBiLinks = new Map<string, number>();
  
    for (const note of notes) {
      const content = await vault.cachedRead(note);
  
      // Find all unique keywords in the note
      const uniqueKeywords = content.match(/\b\w+\b/g) || []; // add default empty array
  
      // Increase the count for each keyword that is not a valid bi-link
      for (const keyword of uniqueKeywords) {
        if (
          !potentialBiLinks.has(keyword) &&
          !this.biLinks.some((biLink) => biLink.keyword === keyword)
        ) {
          potentialBiLinks.set(keyword, 1);
        } else {
          potentialBiLinks.set(keyword, (potentialBiLinks.get(keyword) || 0) + 1);
        }
      }
    }
  
    this.biLinks = Array.from(potentialBiLinks.entries()).map(([keyword, count]) => ({
      keyword,
      count,
      isSelected: false,
    }));
  
    await this.saveDataToLocalStorage(this.biLinks);
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
    
    const table = containerEl.createEl('table', { cls: 'content-linker-table' });
    
    // Create table headers
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headerRow.insertCell().textContent = 'No.';
    headerRow.insertCell().textContent = 'Count';
    headerRow.insertCell().textContent = 'Keyword';
    headerRow.insertCell().textContent = 'Selected';
    
    // Sort the biLinks array based on count in descending order
    const sortedBiLinks = this.plugin.biLinks.sort((a, b) => b.count - a.count);
    
    // Create table body rows
    const tbody = table.createTBody();
    for (let index = 0; index < Math.min(sortedBiLinks.length, 100); index++) {
      const { keyword, count, isSelected } = sortedBiLinks[index];
      const row = tbody.insertRow();
      row.insertCell().textContent = (index + 1).toString();
      row.insertCell().textContent = count.toString();
      row.insertCell().textContent = keyword;
      row.insertCell().appendChild(this.createCheckbox(keyword, isSelected));
    }
    
    const updateButton = containerEl.createEl('button', { text: 'Update Bi-Link For Selected Options' });
    updateButton.addEventListener('click', async () => {
      await this.updateBiLinks();
    });
  }

  createCheckbox(keyword: string, checked: boolean): HTMLElement {
    const checkboxContainer = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkboxContainer.appendChild(checkbox);
    
    checkbox.addEventListener('change', async () => {
      this.plugin.biLinks = this.plugin.biLinks.map((biLink) =>
        biLink.keyword === keyword ? { ...biLink, isSelected: checkbox.checked } : biLink
      );

      await this.saveDataToLocalStorage();
    });

    return checkboxContainer;
  }

  async updateBiLinks() {
    const selectedBiLinks = this.plugin.biLinks.filter((biLink) => biLink.isSelected);

    for (const selectedBiLink of selectedBiLinks) {
      const { keyword } = selectedBiLink;

      // Replace all occurrences of the selected keyword in the original content with the bi-link format [[bi-link]]
      const vault = this.plugin.app.vault;
      const notes = vault.getMarkdownFiles();

      for (const note of notes) {
        let content = await vault.read(note);

        // Use regex to find and replace the selected keyword with the bi-link format
        const regex = new RegExp(`\\b${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g');
        content = content.replace(regex, `[[${keyword}]]`);

        // Save the updated content back to the note
        await vault.modify(note, content);
      }
    }

    // Deselect the updated bi-links
    this.plugin.biLinks = this.plugin.biLinks.map((biLink) =>
      selectedBiLinks.some(({ keyword }) => biLink.keyword === keyword)
        ? { ...biLink, isSelected: false }
        : biLink
    );

    await this.saveDataToLocalStorage();

    new Notice('Update Finished!');
  }

  async saveDataToLocalStorage(): Promise<void> {
    await this.plugin.saveDataToLocalStorage(this.plugin.biLinks);
  }
}
