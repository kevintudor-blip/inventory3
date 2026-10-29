import {
  InventoryItem,
  InventoryFilter,
  InventoryStats,
  ImportStrategy,
  ImportResult,
  RawCSVRow,
} from './types';

export const CSV_HEADERS = [
  'Primary Subject Area',
  'Ordering Name and/or link, if it applies',
  'Description',
  'Quantity',
  'Rooms/Space Storing Them',
  'Contact people',
  'Consumable? Answer "Yes" or, if no, leave blank. If "Yes," inform Meredith so that she can replace it.',
  'Other notes',
] as const;

export class InventoryService {
  private items: Map<string, InventoryItem> = new Map();

  constructor(initialItems: InventoryItem[] = []) {
    initialItems.forEach((item) => this.items.set(item.id, { ...item }));
  }

  // --- CRUD Operations ---

  public getAll(): InventoryItem[] {
    return Array.from(this.items.values());
  }

  public getById(id: string): InventoryItem | undefined {
    return this.items.get(id);
  }

  public add(item: Omit<InventoryItem, 'id' | 'lastUpdated'>): InventoryItem {
    const newItem: InventoryItem = {
      ...item,
      id: this.generateId(),
      lastUpdated: new Date().toISOString(),
    };
    this.items.set(newItem.id, newItem);
    return newItem;
  }

  public update(id: string, updates: Partial<Omit<InventoryItem, 'id'>>): InventoryItem | null {
    const existing = this.items.get(id);
    if (!existing) return null;

    const updatedItem: InventoryItem = {
      ...existing,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
    this.items.set(id, updatedItem);
    return updatedItem;
  }

  public delete(id: string): boolean {
    return this.items.delete(id);
  }

  public deleteBulk(ids: string[]): number {
    let deletedCount = 0;
    ids.forEach((id) => {
      if (this.items.delete(id)) deletedCount++;
    });
    return deletedCount;
  }

  public toggleArchive(ids: string[], archiveState: boolean): number {
    let count = 0;
    ids.forEach((id) => {
      const item = this.items.get(id);
      if (item) {
        item.isArchived = archiveState;
        item.lastUpdated = new Date().toISOString();
        count++;
      }
    });
    return count;
  }

  public duplicate(id: string): InventoryItem | null {
    const original = this.items.get(id);
    if (!original) return null;

    const copy: InventoryItem = {
      ...original,
      id: this.generateId(),
      orderingNameOrLink: `${original.orderingNameOrLink} (Copy)`,
      lastUpdated: new Date().toISOString(),
    };
    this.items.set(copy.id, copy);
    return copy;
  }

  // --- Search & Filtering ---

  public filter(filter: InventoryFilter): InventoryItem[] {
    return this.getAll().filter((item) => {
      // Archive Filter
      if (!filter.showArchived && item.isArchived) return false;
      if (filter.showArchived && !item.isArchived) return false;

      // Subject Filter
      if (filter.subject && filter.subject !== 'ALL' && item.primarySubjectArea !== filter.subject) {
        return false;
      }

      // Location Filter
      if (filter.location && filter.location !== 'ALL' && item.roomsOrSpace !== filter.location) {
        return false;
      }

      // Consumable Filter
      if (filter.consumableOnly && item.isConsumable !== 'Yes') {
        return false;
      }

      // Low Stock Filter
      if (filter.lowStockOnly) {
        const isLow = item.isConsumable === 'Yes' && item.quantity <= item.reorderThreshold;
        if (!isLow) return false;
      }

      // Free-text Search Query
      if (filter.searchQuery && filter.searchQuery.trim() !== '') {
        const q = filter.searchQuery.toLowerCase();
        const matchesName = item.orderingNameOrLink.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesSubject = item.primarySubjectArea.toLowerCase().includes(q);
        const matchesLocation = item.roomsOrSpace.toLowerCase().includes(q);
        const matchesContact = item.contactPeople.toLowerCase().includes(q);

        if (!matchesName && !matchesDesc && !matchesSubject && !matchesLocation && !matchesContact) {
          return false;
        }
      }

      return true;
    });
  }

  // --- KPI Statistics ---

  public getStats(): InventoryStats {
    const active = this.getAll().filter((i) => !i.isArchived);
    return {
      totalItems: active.length,
      totalQuantity: active.reduce((sum, item) => sum + (item.quantity || 0), 0),
      lowStockCount: active.filter((i) => i.isConsumable === 'Yes' && i.quantity <= i.reorderThreshold).length,
      consumableCount: active.filter((i) => i.isConsumable === 'Yes').length,
      archivedCount: this.getAll().filter((i) => i.isArchived).length,
    };
  }

  // --- Duplicate-Aware CSV Importer ---

  public importCSVRows(rows: RawCSVRow[], strategy: ImportStrategy = 'skip'): ImportResult {
    let imported = 0;
    let skipped = 0;
    let updated = 0;

    rows.forEach((row) => {
      const name = (row['Ordering Name and/or link, if it applies'] || row['Item Name'] || '').trim();
      const location = (row['Rooms/Space Storing Them'] || row['Location'] || 'Unassigned').trim();

      if (!name) return;

      const existingItem = this.findDuplicate(name, location);

      if (existingItem) {
        if (strategy === 'skip') {
          skipped++;
          return;
        } else if (strategy === 'overwrite') {
          this.update(existingItem.id, this.parseRowToItemData(row));
          updated++;
          return;
        }
      }

      this.add(this.parseRowToItemData(row));
      imported++;
    });

    return { imported, skipped, updated };
  }

  // --- Exact 8-Column CSV Exporter ---

  public exportToCSV(): string {
    const activeItems = this.getAll().filter((i) => !i.isArchived);
    const rows = activeItems.map((item) => [
      this.escapeCSV(item.primarySubjectArea),
      this.escapeCSV(item.orderingNameOrLink),
      this.escapeCSV(item.description),
      item.quantity.toString(),
      this.escapeCSV(item.roomsOrSpace),
      this.escapeCSV(item.contactPeople),
      item.isConsumable === 'Yes' ? 'Yes' : '',
      this.escapeCSV(item.otherNotes),
    ]);

    const headerLine = CSV_HEADERS.map((h) => `"${h}"`).join(',');
    const bodyLines = rows.map((r) => r.join(','));

    return [headerLine, ...bodyLines].join('\n');
  }

  // --- Internal Helpers ---

  private findDuplicate(name: string, location: string): InventoryItem | undefined {
    const normName = name.toLowerCase();
    const normLoc = location.toLowerCase();

    return this.getAll().find(
      (item) =>
        item.orderingNameOrLink.toLowerCase() === normName &&
        item.roomsOrSpace.toLowerCase() === normLoc
    );
  }

  private parseRowToItemData(row: RawCSVRow): Omit<InventoryItem, 'id' | 'lastUpdated'> {
    const qtyStr = row['Quantity'] || '1';
    const parsedQty = parseInt(qtyStr.replace(/[^0-9]/g, ''), 10) || 1;
    const consVal = (
      row['Consumable? Answer "Yes" or, if no, leave blank. If "Yes," inform Meredith so that she can replace it.'] ||
      row['Consumable'] ||
      ''
    ).trim().toLowerCase();

    return {
      primarySubjectArea: (row['Primary Subject Area'] || row['Subject'] || 'General').trim(),
      orderingNameOrLink: (row['Ordering Name and/or link, if it applies'] || row['Item Name'] || 'Unnamed Item').trim(),
      description: (row['Description'] || '').trim(),
      quantity: parsedQty,
      roomsOrSpace: (row['Rooms/Space Storing Them'] || row['Location'] || 'Unassigned').trim(),
      contactPeople: (row['Contact people'] || row['Contact'] || '').trim(),
      isConsumable: consVal === 'yes' ? 'Yes' : '',
      reorderThreshold: consVal === 'yes' ? 1 : 0,
      otherNotes: (row['Other notes'] || row['Notes'] || '').trim(),
    };
  }

  private escapeCSV(value: string): string {
    if (!value) return '""';
    return `"${value.replace(/"/g, '""')}"`;
  }

  private generateId(): string {
    return `item_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
  }
}