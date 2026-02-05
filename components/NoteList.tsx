import React, { useState } from 'react';
import { FileText, Plus, Trash2, GripVertical, AlertTriangle } from 'lucide-react';
import { NoteItem } from '../types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  TouchSensor,
  MouseSensor
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Sortable Item Component ---
interface SortableNoteItemProps {
  note: NoteItem;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

const SortableNoteItem: React.FC<SortableNoteItemProps> = ({ note, onSelect, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: note.filename });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={`bg-white p-4 rounded-xl border transition-all cursor-pointer flex flex-col group relative touch-manipulation
        ${isDragging ? 'shadow-xl scale-105 border-blue-400' : 'border-gray-200 shadow-sm hover:shadow-md'}
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
          <FileText size={24} />
        </div>
        
        {/* Delete Button - Stop Propagation to prevent opening note */}
        <button 
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-20"
          title="Delete Note"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <h3 className="font-semibold text-gray-800 text-lg truncate mb-1">
        {note.filename.replace('.md', '')}
      </h3>
      <p className="text-xs text-gray-400 font-mono truncate flex items-center justify-between">
        <span>{note.filename}</span>
        {/* Visual indicator for drag (optional, but helpful) */}
        <GripVertical size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300" />
      </p>
    </div>
  );
};


// --- Main List Component ---
interface NoteListProps {
  notes: NoteItem[];
  onSelectNote: (filename: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (filename: string) => void;
  onReorderNotes: (newOrder: NoteItem[]) => void;
}

export const NoteList: React.FC<NoteListProps> = ({ 
  notes, 
  onSelectNote, 
  onCreateNote,
  onDeleteNote,
  onReorderNotes
}) => {
  
  // State for the custom delete confirmation modal
  const [noteToDelete, setNoteToDelete] = useState<NoteItem | null>(null);

  // Configure sensors for Long Press on mobile
  const sensors = useSensors(
    useSensor(MouseSensor, {
        // Require movement of 10px to start drag on mouse to prevent accidental drags on clicks
        activationConstraint: { distance: 10 } 
    }),
    useSensor(TouchSensor, {
      // Long press 250ms to activate drag
      activationConstraint: {
        delay: 250, 
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = notes.findIndex((n) => n.filename === active.id);
      const newIndex = notes.findIndex((n) => n.filename === over.id);
      
      const newOrder = arrayMove(notes, oldIndex, newIndex);
      onReorderNotes(newOrder);
    }
  };

  const confirmDelete = () => {
    if (noteToDelete) {
      onDeleteNote(noteToDelete.filename);
      setNoteToDelete(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 relative">
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <svg
            className="w-7 h-7 text-blue-600"
            viewBox="0 0 64 64"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Notebook */}
            <rect x="10" y="8" width="34" height="48" rx="4" />

            {/* Notebook spine */}
            <line x1="16" y1="8" x2="16" y2="56" />

            {/* Markdown M */}
            <path d="M22 36 L22 24 L26 30 L30 24 V36" />

            {/* Down arrow */}
            <line x1="26" y1="38" x2="26" y2="44" />
            <path d="M23 41 L26 44 L29 41" />

            {/* Pen */}
            <path d="M40 18 L56 34" />
            <path d="M38 20 L42 16 L58 32 L54 36 Z" />
            <path d="M54 36 L60 38 L58 32 Z" />
          </svg>
          EulCauInk
        </h1>
        <button
          onClick={onCreateNote}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-md"
        >
          <Plus size={20} />
          <span>New Note</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 select-none">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <FileText size={48} className="mb-4 opacity-50" />
            <p className="text-lg">No notes yet.</p>
            <p className="text-sm">Click "New Note" to create one.</p>
          </div>
        ) : (
          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={notes.map(n => n.filename)} 
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                {notes.map((note) => (
                  <SortableNoteItem
                    key={note.filename}
                    note={note}
                    onSelect={() => onSelectNote(note.filename)}
                    onDelete={(e) => {
                      e.stopPropagation();
                      // Trigger custom modal instead of window.confirm
                      setNoteToDelete(note);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>
      
      {/* Toast/Hint for user interaction */}
      <div className="fixed bottom-4 left-0 right-0 text-center pointer-events-none">
         <span className="bg-black/50 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
            Long press to reorder
         </span>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {noteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 transform scale-100 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Note?</h3>
            </div>
            
            <p className="text-gray-600 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-gray-900">"{noteToDelete.title}"</span>? 
              <br/>
              This action cannot be undone.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setNoteToDelete(null)}
                className="px-5 py-2.5 text-gray-700 font-medium hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-5 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 active:scale-95 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};