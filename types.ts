
export enum ViewMode {
  EDIT_ONLY = 'EDIT_ONLY',
  SPLIT = 'SPLIT',
  PREVIEW_ONLY = 'PREVIEW_ONLY'
}

export interface ImageInsertResult {
  url: string;   
  filename: string; 
}

export interface NoteItem {
  filename: string;
  title: string;
  updatedAt: number;
}

export interface AndroidInterface {
  // Image handling
  saveImage(base64Data: string, filename: string): string; 
  
  // Note handling
  getNoteList(): string; 
  loadNote(filename: string): string;
  saveNote(filename: string, content: string): void;
  deleteNote(filename: string): boolean;

  // System interactions
  showToast(message: string): void;
  openExternalLink(url: string): void;

  // NEW: System File Integration
  triggerImportMarkdown(): void;
  triggerExportMarkdown(filename: string, content: string): void;
  triggerPickImage(): void;
}

// Define the structure of events coming back from Android
export type AndroidEventType = 'IMPORT_MD_RESULT' | 'PICK_IMAGE_RESULT' | 'EXPORT_SUCCESS' | 'ERROR';

declare global {
  interface Window {
    Android?: AndroidInterface;
    // Callback function called by Kotlin
    handleAndroidEvent?: (type: AndroidEventType, data: string, extra?: string) => void;
  }
}
