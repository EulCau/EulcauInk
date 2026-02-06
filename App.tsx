
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { PenTool, Layout, Columns, Eye, ChevronLeft, Save, Upload, Download, Image as ImageIcon, FileUp } from 'lucide-react';
import { MarkdownEditor } from './components/MarkdownEditor';
import { DrawingCanvas } from './components/DrawingCanvas';
import { NoteList } from './components/NoteList';
import { ImageService } from './services/imageService';
import { NoteService } from './services/noteService';
import { ViewMode, NoteItem, AndroidEventType } from './types';

// New note template
const NEW_NOTE_TEMPLATE = `# Untitled

Start writing here...
`;

const App: React.FC = () => {
  // Navigation State
  const [screen, setScreen] = useState<'LIST' | 'EDITOR'>('LIST');
  const [currentFilename, setCurrentFilename] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);

  // Editor State
  const [content, setContent] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SPLIT);
  const [isDrawing, setIsDrawing] = useState(false);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Hidden input refs for Web Fallback
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Load Notes on Mount or when returning to list
  useEffect(() => {
    if (screen === 'LIST') {
      const loadedNotes = NoteService.getNotes();
      setNotes(loadedNotes);
    }
  }, [screen]);

  // When drawing starts, blur inputs
  useEffect(() => {
    if (isDrawing && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [isDrawing]);

  // --- Android Callback Listener ---
  useEffect(() => {
    // Define the global handler for Android events
    window.handleAndroidEvent = (type: AndroidEventType, data: string, extra?: string) => {
      console.log("Android Event:", type, data);
      
      if (type === 'IMPORT_MD_RESULT') {
        // data = content, extra = filename
        const newFilename = extra || `Imported_${Date.now()}.md`;
        NoteService.saveNote(newFilename, data);
        setNotes(NoteService.getNotes()); // Refresh list
        if (window.Android) window.Android.showToast("Note imported successfully");
      } 
      else if (type === 'PICK_IMAGE_RESULT') {
        // data = filename (saved in internal storage by Kotlin)
        // We construct the virtual URL to display it
        const virtualUrl = `https://eulcauink.local/user-images/${data}`;
        insertImageMarkdown(virtualUrl, "Image");
      }
      else if (type === 'EXPORT_SUCCESS') {
        if (window.Android) window.Android.showToast(`Exported to: ${data}`);
      }
      else if (type === 'ERROR') {
         alert("System Error: " + data);
      }
    };

    return () => {
      window.handleAndroidEvent = undefined;
    };
  }, []); 


  // --- Auto-Save Logic ---
  useEffect(() => {
    if (!currentFilename || !content) return;
    const timer = setTimeout(() => {
      NoteService.saveNote(currentFilename, content);
    }, 2000); 
    return () => clearTimeout(timer);
  }, [content, currentFilename]);


  // --- Helper: Insert Markdown Image ---
  const insertImageMarkdown = (url: string, alt: string) => {
      const markdownImage = `\n![${alt}](${url})\n`;

      if (editorRef.current && editorRef.current.view) {
        const view = editorRef.current.view;
        const cursor = view.state.selection.main.head;
        view.dispatch({
          changes: { from: cursor, insert: markdownImage },
          selection: { anchor: cursor + markdownImage.length }
        });
      } else {
        setContent(prev => prev + markdownImage);
      }
  };


  // --- Navigation Handlers ---

  const handleCreateNote = () => {
    setContent(NEW_NOTE_TEMPLATE);
    setCurrentFilename(null); 
    setScreen('EDITOR');
  };

  const handleSelectNote = (filename: string) => {
    const loadedContent = NoteService.loadNote(filename);
    setContent(loadedContent);
    setCurrentFilename(filename);
    setScreen('EDITOR');
  };

  const handleDeleteNote = (filename: string) => {
    const success = NoteService.deleteNote(filename);
    if (success) {
        setNotes(prev => prev.filter(n => n.filename !== filename));
    }
  };

  const handleReorderNotes = (newNotes: NoteItem[]) => {
    setNotes(newNotes);
    const filenames = newNotes.map(n => n.filename);
    NoteService.saveNoteOrder(filenames);
  };

  const handleBackToList = () => {
    if (currentFilename) {
        NoteService.saveNote(currentFilename, content);
    }
    setScreen('LIST');
  };

  const handleNavigate = (linkTarget: string) => {
    const decodedTarget = decodeURIComponent(linkTarget);
    let targetFilename = decodedTarget.replace(/^(\.\/|\/)/, '');
    let targetNote = notes.find(n => n.filename === targetFilename);
    
    if (!targetNote && !targetFilename.toLowerCase().endsWith('.md')) {
        targetNote = notes.find(n => n.filename === `${targetFilename}.md`);
    }

    if (targetNote) {
        if (currentFilename && content) {
            NoteService.saveNote(currentFilename, content);
        }
        handleSelectNote(targetNote.filename);
    } else {
        const msg = `Note not found: ${targetFilename}`;
        if (window.Android) window.Android.showToast(msg);
        else alert(msg);
    }
  };

  // --- Feature Handlers ---

  const handleSaveNote = () => {
    let newFilename = currentFilename;
    const titleMatch = content.match(/^#\s+(.+)$/m);
    
    if (titleMatch && titleMatch[1]) {
      const safeTitle = titleMatch[1].replace(/[<>:"/\\|?*]/g, '').trim();
      if (safeTitle) {
        newFilename = `${safeTitle}.md`;
      }
    }

    if (!newFilename) {
      newFilename = `Untitled_${Date.now()}.md`;
    }

    NoteService.saveNote(newFilename, content);
    setCurrentFilename(newFilename);
  };

  const handleDrawingSave = useCallback(async (base64Data: string) => {
    try {
      const { url } = await ImageService.saveBase64Image(base64Data);
      insertImageMarkdown(url, "Handwriting");
      setIsDrawing(false);
    } catch (err) {
      console.error("Failed to save drawing", err);
      alert("Error saving drawing.");
    }
  }, []);


  // --- Import / Export / Upload Logic ---

  const handleImportClick = () => {
      if (window.Android && window.Android.triggerImportMarkdown) {
          window.Android.triggerImportMarkdown();
      } else {
          // Web Fallback
          fileInputRef.current?.click();
      }
  };

  const handleWebFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          const newFilename = file.name;
          NoteService.saveNote(newFilename, text);
          setNotes(NoteService.getNotes());
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  const handleExportClick = () => {
      if (!currentFilename) return;

      if (window.Android && window.Android.triggerExportMarkdown) {
          window.Android.triggerExportMarkdown(currentFilename, content);
      } else {
          // Web Fallback
          const blob = new Blob([content], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = currentFilename;
          a.click();
          URL.revokeObjectURL(url);
      }
  };

  const handleImageUploadClick = () => {
      if (window.Android && window.Android.triggerPickImage) {
          window.Android.triggerPickImage();
      } else {
          // Web Fallback
          imageInputRef.current?.click();
      }
  };

  const handleWebImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
          const base64 = evt.target?.result as string;
          const { url } = await ImageService.saveBase64Image(base64);
          insertImageMarkdown(url, "Image");
          if (imageInputRef.current) imageInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
  };


  // --- RENDER ---

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Hidden Web Inputs */}
      <input 
        type="file" 
        accept=".md" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleWebFileImport} 
      />
      <input 
        type="file" 
        accept="image/*" 
        ref={imageInputRef} 
        className="hidden" 
        onChange={handleWebImageUpload} 
      />

      {screen === 'LIST' ? (
        <div className="h-full flex flex-col">
            <NoteList 
                notes={notes} 
                onCreateNote={handleCreateNote} 
                onSelectNote={handleSelectNote} 
                onDeleteNote={handleDeleteNote}
                onReorderNotes={handleReorderNotes}
            />
            {/* Floating Import Button for List View */}
            <div className="fixed bottom-6 right-6 z-20">
                <button 
                    onClick={handleImportClick}
                    className="flex items-center gap-2 px-4 py-3 bg-white text-gray-700 rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all"
                >
                    <FileUp size={20} className="text-blue-600" />
                    <span className="font-medium">Import .md</span>
                </button>
            </div>
        </div>
      ) : (
        <div className="h-full flex flex-col bg-gray-50">
          {/* Editor Navbar */}
          <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm z-10">
            <div className="flex items-center space-x-2">
                <button 
                  onClick={handleBackToList}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                  title="Back to List"
                >
                  <ChevronLeft size={24} />
                </button>
                <h1 className="text-sm font-bold text-gray-700 truncate max-w-[100px] sm:max-w-xs">
                  {currentFilename || "Unsaved Note"}
                </h1>
            </div>

            <div className="flex items-center space-x-1 sm:space-x-3">
                {/* View Mode Switcher - Hidden on very small screens */}
                <div className="flex bg-gray-100 rounded-lg p-1 hidden md:flex">
                    <button onClick={() => setViewMode(ViewMode.EDIT_ONLY)} className={`p-1.5 rounded-md ${viewMode === ViewMode.EDIT_ONLY ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}><Layout size={18} /></button>
                    <button onClick={() => setViewMode(ViewMode.SPLIT)} className={`p-1.5 rounded-md ${viewMode === ViewMode.SPLIT ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}><Columns size={18} /></button>
                    <button onClick={() => setViewMode(ViewMode.PREVIEW_ONLY)} className={`p-1.5 rounded-md ${viewMode === ViewMode.PREVIEW_ONLY ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}><Eye size={18} /></button>
                </div>

                <div className="h-6 w-px bg-gray-300 mx-1 hidden md:block"></div>

                {/* Upload Image */}
                <button 
                    onClick={handleImageUploadClick}
                    className="p-2 text-gray-700 hover:bg-gray-100 rounded-full"
                    title="Insert Image"
                >
                    <ImageIcon size={20} />
                </button>

                {/* Handwriting */}
                <button 
                    onClick={() => setIsDrawing(true)}
                    className="p-2 text-gray-700 hover:bg-gray-100 rounded-full"
                    title="Insert Drawing"
                >
                    <PenTool size={20} />
                </button>
                
                 {/* Export */}
                 <button 
                    onClick={handleExportClick}
                    className="p-2 text-gray-700 hover:bg-gray-100 rounded-full"
                    title="Export Markdown"
                >
                    <Download size={20} />
                </button>

                <button
                    onClick={handleSaveNote}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 active:scale-95 transition-all shadow-sm ml-2"
                    title="Save Note"
                >
                    <Save size={18} />
                    <span className="hidden sm:inline font-medium">Save</span>
                </button>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-hidden flex flex-col relative">
            <MarkdownEditor 
                content={content} 
                onChange={setContent} 
                viewMode={viewMode}
                editorRef={editorRef}
                readOnly={isDrawing}
                onNavigate={handleNavigate} 
            />
          </main>

          {/* Drawing Modal */}
          {isDrawing && (
            <DrawingCanvas 
                onSave={handleDrawingSave} 
                onCancel={() => setIsDrawing(false)} 
            />
          )}
        </div>
      )}
    </div>
  );
};

export default App;
