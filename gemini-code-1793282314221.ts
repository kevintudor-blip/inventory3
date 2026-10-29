export type SubjectCategory =
  | 'Art'
  | 'English/Language Arts'
  | 'Fitness/PE'
  | 'Games'
  | 'General'
  | 'Handwriting'
  | 'Hygiene'
  | 'Kitchen'
  | 'Maintenance'
  | 'Math'
  | 'Reading'
  | 'Science'
  | 'Social Studies'
  | string;

export type ConsumableStatus = 'Yes' | '';

export type ImportStrategy = 'skip' | 'overwrite' | 'import_all';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface InventoryItem {
  id: string;
  primarySubjectArea: SubjectCategory;
  orderingNameOrLink: string;
  description: string;
  quantity: number;
  roomsOrSpace: string;
  contactPeople: string;
  isConsumable: ConsumableStatus;
  reorderThreshold: number;
  otherNotes: string;
  imageUrl?: string;
  isArchived?: boolean;
  lastUpdated?: string;
}

export interface RawCSVRow {
  [headerName: string]: string;
}

export interface InventoryFilter {
  searchQuery?: string;
  subject?: SubjectCategory | 'ALL';
  location?: string | 'ALL';
  consumableOnly?: boolean;
  lowStockOnly?: boolean;
  showArchived?: boolean;
}

export interface InventoryStats {
  totalItems: number;
  totalQuantity: number;
  lowStockCount: number;
  consumableCount: number;
  archivedCount: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  updated: number;
}