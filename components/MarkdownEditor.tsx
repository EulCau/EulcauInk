import React from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import { ViewMode } from '../types';

interface MarkdownEditorProps {
  content: string;
  onChange: (val: string) => void;
  viewMode: ViewMode;
  editorRef: React.RefObject<ReactCodeMirrorRef>;
  readOnly?: boolean;
  onNavigate?: (target: string) => void;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ 
  content, 
  onChange, 
  viewMode, 
  editorRef,
  readOnly = false,
  onNavigate
}) => {

  // Editor Extensions
  const extensions = [
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    EditorView.lineWrapping,
    EditorView.theme({
        "&": { height: "100%" },
        ".cm-scroller": { fontFamily: "'Fira Code', 'Roboto Mono', monospace" }
    })
  ];

  const showEditor = viewMode === ViewMode.EDIT_ONLY || viewMode === ViewMode.SPLIT;
  const showPreview = viewMode === ViewMode.PREVIEW_ONLY || viewMode === ViewMode.SPLIT;

  // Unified Link Handler Logic
  const handleLinkClick = (e: React.MouseEvent, href?: string) => {
      // 1. ALWAYS prevent default browser navigation immediately.
      // This stops the WebView from trying to load the URL, preventing crashes/refreshes.
      e.preventDefault();
      e.stopPropagation();

      if (!href) return;

      const lowerHref = href.toLowerCase();

      // 2. Block 'file://' explicitly
      // React-markdown might sometimes pass 'file:' protocol through depending on version.
      // We block it here to prevent crashes.
      if (lowerHref.startsWith('file:') || lowerHref.startsWith('content:')) {
          const msg = "Local file/content links are not supported.";
          if (window.Android && window.Android.showToast) {
              window.Android.showToast(msg);
          } else {
              alert(msg);
          }
          return;
      }

      // 3. Handle Email (mailto:) and Phone (tel:)
      if (lowerHref.startsWith('mailto:') || lowerHref.startsWith('tel:')) {
        if (window.Android && window.Android.openExternalLink) {
          // Android Intent.ACTION_VIEW handles these protocols natively
          window.Android.openExternalLink(href);
        } else {
          // Web fallback: '_self' triggers the protocol handler without opening a blank tab
          window.open(href, '_self');
        }
        return;
      }

      // 4. External Links (http/https)
      if (/^https?:\/\//i.test(href)) {
        if (window.Android && window.Android.openExternalLink) {
          window.Android.openExternalLink(href);
        } else {
          window.open(href, '_blank');
        }
        return;
      }

      // 5. Anchor Links (#section)
      if (href.startsWith('#')) {
        try {
          const id = decodeURIComponent(href.substring(1));
          let element = document.getElementById(id);
          if (!element) {
             const slugId = id.toLowerCase().replace(/\s+/g, '-');
             element = document.getElementById(slugId);
          }
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } catch (err) {
          console.warn("Anchor navigation failed", err);
        }
        return;
      }

      // 6. Internal Note Links (everything else)
      if (onNavigate) {
         onNavigate(href);
      }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Editor Pane */}
      {showEditor && (
        <div className={`h-full overflow-hidden ${viewMode === ViewMode.SPLIT ? 'w-1/2 border-r border-gray-200' : 'w-full'}`}>
          <CodeMirror
            ref={editorRef}
            value={content}
            height="100%"
            extensions={extensions}
            onChange={onChange}
            readOnly={readOnly}
            editable={!readOnly}
            theme="light"
            className="h-full text-base"
            basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightSpecialChars: true,
                history: true,
                foldGutter: true,
                drawSelection: true,
                dropCursor: true,
                allowMultipleSelections: false,
                indentOnInput: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                rectangularSelection: true,
                crosshairCursor: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                closeBracketsKeymap: true,
                defaultKeymap: true,
                searchKeymap: true,
                historyKeymap: true,
                foldKeymap: true,
                completionKeymap: true,
                lintKeymap: true,
            }}
          />
        </div>
      )}

      {/* Preview Pane */}
      {showPreview && (
        <div 
            className={`h-full overflow-y-auto bg-white p-8 prose prose-slate max-w-none ${viewMode === ViewMode.SPLIT ? 'w-1/2' : 'w-full'}`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex, rehypeSlug]}
            // Allow all URLs to pass through sanitization so we can catch them in onClick
            urlTransform={(value: string) => value}
            components={{
              // Custom Link Component to strictly control navigation
              a: ({node, href, children, ...props}) => {
                  return (
                      <a 
                        href={href} 
                        onClick={(e) => handleLinkClick(e, href)} 
                        className="text-blue-600 hover:underline cursor-pointer"
                        {...props}
                      >
                          {children}
                      </a>
                  );
              },
              img: ({node, ...props}) => (
                <span className="block my-4 text-center">
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <img 
                        {...props} 
                        className="max-h-[500px] mx-auto rounded shadow-sm border border-gray-100" 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            // Optional: Insert a text placeholder or icon here if needed
                            target.parentElement?.insertAdjacentHTML('beforeend', `<span class="text-red-500 text-sm p-2 border border-red-200 rounded bg-red-50 block">Image failed to load: ${target.src}</span>`);
                        }}
                    />
                </span>
              )
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};