import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  insertNewlineAndIndent,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as editorPlaceholder,
} from '@codemirror/view';
import { type MutableRefObject, useEffect, useRef } from 'react';

export type CodeMirrorSelection = {
  from: number;
  to: number;
};

export type CodeMirrorEditorHandle = {
  focus: () => void;
  focusEnd: () => void;
  getValue: () => string;
  getSelection: () => CodeMirrorSelection;
  replaceRange: (from: number, to: number, text: string) => void;
};

type CodeMirrorEditorProps = {
  id?: string;
  value: string;
  minHeight?: string;
  placeholder?: string;
  ariaLabel: string;
  readOnly?: boolean;
  editorRef?: MutableRefObject<CodeMirrorEditorHandle | null>;
  onReady?: (handle: CodeMirrorEditorHandle | null) => void;
  onSelectionChange?: (selection: CodeMirrorSelection) => void;
  showLineNumbers?: boolean;
  preferPlainTextPaste?: boolean;
  submitOnEnter?: boolean;
  onSubmit?: () => void;
  onChange: (value: string) => void;
};

type CompositionSnapshot = {
  doc: string;
  from: number;
  to: number;
};

type DeferredInputFallback = {
  doc: string;
  from: number;
  to: number;
  text: string;
};

const CHINESE_PUNCTUATION_FALLBACKS: Record<string, string> = {
  Period: '。',
};

const shouldInsertCompositionFallback = (value: string) =>
  /[^\u0000-\u007f]/.test(value);

const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--rin-ink)',
    backgroundColor: 'var(--rin-surface)',
    border: '1px solid var(--rin-border)',
    borderRadius: '6px',
    overflow: 'hidden',
    fontSize: '0.96rem',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--rin-accent)',
    boxShadow: '0 0 0 3px color-mix(in srgb, var(--rin-accent) 20%, transparent)',
  },
  '.cm-scroller': {
    fontFamily: "'IBM Plex Mono', 'Noto Sans SC', monospace",
    lineHeight: '1.7',
  },
  '.cm-content': {
    padding: '12px 0',
    caretColor: 'var(--rin-ink)',
  },
  '.cm-line': {
    padding: '0 14px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--rin-canvas)',
    color: 'var(--rin-ink-muted)',
    borderRight: '1px solid var(--rin-border)',
  },
  '.cm-activeLineGutter, .cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--rin-accent) 8%, transparent)',
  },
  '.cm-placeholder': {
    color: 'var(--rin-ink-muted)',
  },
});

// Light values mirror @codemirror/language's defaultHighlightStyle; dark values
// come from the --rin-code-* tokens in tokens.css, so both themes follow the
// document theme without reconfiguring the editor.
const rinCodeHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: 'var(--rin-code-meta)' },
  { tag: tags.link, textDecoration: 'underline' },
  { tag: tags.heading, textDecoration: 'underline', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.keyword, color: 'var(--rin-code-keyword)' },
  { tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName], color: 'var(--rin-code-atom)' },
  { tag: [tags.literal, tags.inserted], color: 'var(--rin-code-literal)' },
  { tag: [tags.string, tags.deleted], color: 'var(--rin-code-string)' },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], color: 'var(--rin-code-regexp)' },
  { tag: tags.definition(tags.variableName), color: 'var(--rin-code-def)' },
  { tag: tags.local(tags.variableName), color: 'var(--rin-code-local)' },
  { tag: [tags.typeName, tags.namespace], color: 'var(--rin-code-typename)' },
  { tag: tags.className, color: 'var(--rin-code-class)' },
  { tag: [tags.special(tags.variableName), tags.macroName], color: 'var(--rin-code-special)' },
  { tag: tags.definition(tags.propertyName), color: 'var(--rin-code-propdef)' },
  { tag: tags.comment, color: 'var(--rin-code-comment)' },
  { tag: tags.invalid, color: 'var(--rin-code-invalid)' },
]);

function editorExtensions(
  valueRef: MutableRefObject<string>,
  onChangeRef: MutableRefObject<(value: string) => void>,
  composingRef: MutableRefObject<boolean>,
  pendingExternalValueRef: MutableRefObject<string | null>,
  compositionSnapshotRef: MutableRefObject<CompositionSnapshot | null>,
  compositionTextRef: MutableRefObject<string>,
  deferredInputFallbackRef: MutableRefObject<DeferredInputFallback | null>,
  deferredInputFallbackTimerRef: MutableRefObject<number | null>,
  onSelectionChangeRef: MutableRefObject<
    ((selection: CodeMirrorSelection) => void) | undefined
  >,
  onSubmitRef: MutableRefObject<(() => void) | undefined>,
  options: Pick<
    CodeMirrorEditorProps,
    | 'ariaLabel'
    | 'minHeight'
    | 'placeholder'
    | 'preferPlainTextPaste'
    | 'readOnly'
    | 'showLineNumbers'
    | 'submitOnEnter'
  >,
): Extension[] {
  const dispatchWholeDocument = (view: EditorView, nextValue: string) => {
    valueRef.current = nextValue;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: nextValue,
      },
    });
  };
  const finishComposition = (view: EditorView, compositionText: string) => {
    const snapshot = compositionSnapshotRef.current;
    compositionSnapshotRef.current = null;
    compositionTextRef.current = '';
    composingRef.current = false;
    const pendingValue = pendingExternalValueRef.current;
    pendingExternalValueRef.current = null;
    if (pendingValue !== null && valueRef.current !== pendingValue) {
      dispatchWholeDocument(view, pendingValue);
      return;
    }
    if (
      !snapshot ||
      !compositionText ||
      options.readOnly ||
      !shouldInsertCompositionFallback(compositionText)
    ) {
      return;
    }
    if (view.state.doc.toString() !== snapshot.doc) {
      return;
    }
    const documentLength = view.state.doc.length;
    const from = Math.min(snapshot.from, documentLength);
    const to = Math.min(snapshot.to, documentLength);
    view.dispatch({
      changes: { from, to, insert: compositionText },
      selection: { anchor: from + compositionText.length },
      userEvent: 'input.type',
    });
    const nextValue = view.state.doc.toString();
    valueRef.current = nextValue;
    onChangeRef.current(nextValue);
  };
  const clearDeferredInputFallback = () => {
    if (deferredInputFallbackTimerRef.current !== null) {
      window.clearTimeout(deferredInputFallbackTimerRef.current);
      deferredInputFallbackTimerRef.current = null;
    }
    deferredInputFallbackRef.current = null;
  };
  const scheduleDeferredInputFallback = (view: EditorView, text: string) => {
    clearDeferredInputFallback();
    const selection = view.state.selection.main;
    deferredInputFallbackRef.current = {
      doc: view.state.doc.toString(),
      from: selection.from,
      to: selection.to,
      text,
    };
    deferredInputFallbackTimerRef.current = window.setTimeout(() => {
      const fallback = deferredInputFallbackRef.current;
      deferredInputFallbackRef.current = null;
      deferredInputFallbackTimerRef.current = null;
      if (!fallback || options.readOnly) return;
      if (view.state.doc.toString() !== fallback.doc) return;
      const documentLength = view.state.doc.length;
      const from = Math.min(fallback.from, documentLength);
      const to = Math.min(fallback.to, documentLength);
      view.dispatch({
        changes: { from, to, insert: fallback.text },
        selection: { anchor: from + fallback.text.length },
        userEvent: 'input.type',
      });
      const nextValue = view.state.doc.toString();
      valueRef.current = nextValue;
      onChangeRef.current(nextValue);
    }, 80);
  };
  return [
    options.showLineNumbers === false ? [] : lineNumbers(),
    options.showLineNumbers === false ? [] : highlightActiveLineGutter(),
    history(),
    drawSelection(),
    dropCursor(),
    bracketMatching(),
    markdown(),
    syntaxHighlighting(rinCodeHighlightStyle, { fallback: true }),
    Prec.highest(
      keymap.of([
        {
          key: 'Shift-Enter',
          run: (view) => insertNewlineAndIndent(view),
        },
        {
          key: 'Enter',
          preventDefault: true,
          run: (view) => {
            if (options.submitOnEnter === false) {
              return insertNewlineAndIndent(view);
            }
            if (
              !options.readOnly &&
              !composingRef.current &&
              onSubmitRef.current
            ) {
              onSubmitRef.current();
              return true;
            }
            return false;
          },
        },
      ]),
    ),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.editable.of(!options.readOnly),
    EditorState.readOnly.of(Boolean(options.readOnly)),
    EditorView.contentAttributes.of({
      'aria-label': options.ariaLabel,
      spellcheck: 'true',
    }),
    EditorView.domEventHandlers({
      paste(event, view) {
        if (!options.preferPlainTextPaste || options.readOnly) return false;
        const clipboard = event.clipboardData;
        if (!clipboard || !Array.from(clipboard.types).includes('text/plain')) {
          return false;
        }
        event.preventDefault();
        const selection = view.state.selection.main;
        const text = clipboard.getData('text/plain');
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          selection: { anchor: selection.from + text.length },
          userEvent: 'input.paste',
        });
        return true;
      },
      compositionstart(_event, view) {
        composingRef.current = true;
        const selection = view.state.selection.main;
        compositionSnapshotRef.current = {
          doc: view.state.doc.toString(),
          from: selection.from,
          to: selection.to,
        };
        compositionTextRef.current = '';
        return false;
      },
      compositionupdate(event) {
        if (event.data) {
          compositionTextRef.current = event.data;
        }
        return false;
      },
      compositionend(event, view) {
        finishComposition(view, event.data || compositionTextRef.current);
        return false;
      },
      compositioncancel(_event, view) {
        finishComposition(view, '');
        return false;
      },
      beforeinput(event) {
        if (
          event instanceof InputEvent &&
          event.inputType === 'insertCompositionText' &&
          event.data
        ) {
          compositionTextRef.current = event.data;
        }
        return false;
      },
      input(event) {
        if (
          event instanceof InputEvent &&
          event.inputType === 'insertCompositionText' &&
          event.data
        ) {
          compositionTextRef.current = event.data;
        }
        return false;
      },
      keydown(event, view) {
        const fallbackText =
          CHINESE_PUNCTUATION_FALLBACKS[event.code] ||
          (event.key === '.' || event.key === '。' ? '。' : '');
        if (
          fallbackText &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          scheduleDeferredInputFallback(view, fallbackText);
        }
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        const selection = update.state.selection.main;
        onSelectionChangeRef.current?.({ from: selection.from, to: selection.to });
      }
      if (update.docChanged) {
        clearDeferredInputFallback();
        const nextValue = update.state.doc.toString();
        valueRef.current = nextValue;
        onChangeRef.current(nextValue);
      }
    }),
    EditorView.theme({
      '&': {
        minHeight: options.minHeight || '150px',
      },
      '.cm-scroller': {
        minHeight: options.minHeight || '150px',
      },
    }),
    editorTheme,
    options.placeholder ? editorPlaceholder(options.placeholder) : [],
  ];
}

export default function CodeMirrorEditor({
  id,
  value,
  minHeight,
  placeholder,
  ariaLabel,
  readOnly,
  editorRef,
  onReady,
  onSelectionChange,
  showLineNumbers = true,
  preferPlainTextPaste = false,
  submitOnEnter = true,
  onSubmit,
  onChange,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const composingRef = useRef(false);
  const pendingExternalValueRef = useRef<string | null>(null);
  const compositionSnapshotRef = useRef<CompositionSnapshot | null>(null);
  const compositionTextRef = useRef('');
  const deferredInputFallbackRef = useRef<DeferredInputFallback | null>(null);
  const deferredInputFallbackTimerRef = useRef<number | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onSubmitRef = useRef(onSubmit);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: editorExtensions(
        valueRef,
        onChangeRef,
        composingRef,
        pendingExternalValueRef,
        compositionSnapshotRef,
        compositionTextRef,
        deferredInputFallbackRef,
        deferredInputFallbackTimerRef,
        onSelectionChangeRef,
        onSubmitRef,
        {
          ariaLabel,
          minHeight,
          placeholder,
          preferPlainTextPaste,
          readOnly,
          showLineNumbers,
          submitOnEnter,
        },
      ),
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    const selection = view.state.selection.main;
    onSelectionChangeRef.current?.({ from: selection.from, to: selection.to });
    const handle: CodeMirrorEditorHandle = {
      focus: () => view.focus(),
      focusEnd: () => {
        view.dispatch({
          selection: { anchor: view.state.doc.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      getValue: () => view.state.doc.toString(),
      getSelection: () => {
        const current = view.state.selection.main;
        return { from: current.from, to: current.to };
      },
      replaceRange: (from, to, text) => {
        const docLength = view.state.doc.length;
        const safeFrom = Math.max(0, Math.min(from, docLength));
        const safeTo = Math.max(safeFrom, Math.min(to, docLength));
        view.dispatch({
          changes: { from: safeFrom, to: safeTo, insert: text },
          selection: { anchor: safeFrom + text.length },
          userEvent: 'input',
        });
        view.focus();
      },
    };
    if (editorRef) {
      editorRef.current = handle;
    }
    onReadyRef.current?.(handle);

    return () => {
      if (deferredInputFallbackTimerRef.current !== null) {
        window.clearTimeout(deferredInputFallbackTimerRef.current);
        deferredInputFallbackTimerRef.current = null;
      }
      view.destroy();
      viewRef.current = null;
      if (editorRef?.current) {
        editorRef.current = null;
      }
      onReadyRef.current?.(null);
    };
  }, [
    ariaLabel,
    editorRef,
    minHeight,
    placeholder,
    preferPlainTextPaste,
    readOnly,
    showLineNumbers,
    submitOnEnter,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || valueRef.current === value) return;
    if (composingRef.current || view.composing || view.compositionStarted) {
      pendingExternalValueRef.current = value;
      return;
    }
    valueRef.current = value;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }, [value]);

  return <div className="code-editor" id={id} ref={hostRef} />;
}
