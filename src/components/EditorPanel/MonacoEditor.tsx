import React, { useEffect, useRef, memo } from 'react'
import * as monaco from 'monaco-editor'
import { useEditorStore } from '../../stores/useEditorStore'

// ── Models cache — module-level, survives React re-renders ────────────────────
const modelCache = new Map<string, monaco.editor.ITextModel>()

function getOrCreateModel(
  filePath: string,
  content:  string,
  language: string,
): monaco.editor.ITextModel {
  const uri      = monaco.Uri.file(filePath)
  const existing = modelCache.get(filePath) ?? monaco.editor.getModel(uri)
  if (existing && !existing.isDisposed()) {
    modelCache.set(filePath, existing)
    // Sync content if disk content changed and file isn't dirty in editor
    const isDirty = useEditorStore.getState().openFiles.find(f => f.path === filePath)?.isDirty
    if (!isDirty && existing.getValue() !== content) {
      existing.setValue(content)
    }
    return existing
  }
  const model = monaco.editor.createModel(content, language, uri)
  modelCache.set(filePath, model)
  return model
}

/** Called when a file is deleted — removes stale model from cache */
export function invalidateModelCache(filePath: string) {
  const m = modelCache.get(filePath)
  if (m && !m.isDisposed()) m.dispose()
  modelCache.delete(filePath)
}

// ── TypeScript/JavaScript compiler options ─────────────────────────────────────
// We access the runtime API via the global `monaco.languages.typescript` namespace
// which is populated by the side-effect import above. Using `as any` to avoid
// deprecated-type warnings in monaco 0.55 while keeping full runtime power.
function configureTypeScript() {
  const ts = (monaco.languages as any).typescript
  if (!ts) return

  const compilerOptions = {
    target:                      ts.ScriptTarget.ES2022,
    module:                      ts.ModuleKind.ESNext,
    moduleResolution:            ts.ModuleResolutionKind.NodeJs,
    strict:                      true,
    jsx:                         ts.JsxEmit.ReactJSX,
    allowJs:                     true,
    checkJs:                     true,
    esModuleInterop:             true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule:           true,
    experimentalDecorators:      true,
    emitDecoratorMetadata:       true,
    skipLibCheck:                true,
    noEmit:                      true,
  }

  ts.typescriptDefaults.setCompilerOptions(compilerOptions)
  ts.javascriptDefaults.setCompilerOptions(compilerOptions)

  ts.typescriptDefaults.setEagerModelSync(true)
  ts.javascriptDefaults.setEagerModelSync(true)

  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation:    false,
    noSyntaxValidation:      false,
    noSuggestionDiagnostics: false,
  })
  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation:    false,
    noSyntaxValidation:      false,
    noSuggestionDiagnostics: false,
  })
}

// ── Custom Orch dark theme ────────────────────────────────────────────────────
function registerOrchTheme() {
  monaco.editor.defineTheme('orch-dark', {
    base:    'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',                foreground: 'c792ea', fontStyle: 'italic' },
      { token: 'keyword.control',        foreground: 'c792ea', fontStyle: 'italic' },
      { token: 'entity.name.function',   foreground: '82aaff' },
      { token: 'support.function',       foreground: '82aaff' },
      { token: 'entity.name.type',       foreground: 'ffcb6b' },
      { token: 'support.type',           foreground: 'ffcb6b' },
      { token: 'entity.name.class',      foreground: 'ffcb6b', fontStyle: 'bold' },
      { token: 'string',                 foreground: 'c3e88d' },
      { token: 'string.quoted',          foreground: 'c3e88d' },
      { token: 'constant.numeric',       foreground: 'f78c6c' },
      { token: 'number',                 foreground: 'f78c6c' },
      { token: 'comment',                foreground: '546e7a', fontStyle: 'italic' },
      { token: 'variable',               foreground: 'eeffff' },
      { token: 'variable.parameter',     foreground: 'f07178', fontStyle: 'italic' },
      { token: 'variable.other.property',foreground: 'f07178' },
      { token: 'keyword.operator',       foreground: '89ddff' },
      { token: 'meta.decorator',         foreground: 'ffcb6b' },
      { token: 'tag',                    foreground: 'f07178' },
      { token: 'tag.html',               foreground: 'f07178' },
      { token: 'attribute.name',         foreground: 'ffcb6b' },
      { token: 'attribute.value',        foreground: 'c3e88d' },
      
      // Markdown
      { token: 'keyword.md',             foreground: 'c792ea', fontStyle: 'bold' },
      { token: 'markup.heading',         foreground: '82aaff', fontStyle: 'bold' },
      { token: 'markup.bold',            foreground: 'ffcb6b', fontStyle: 'bold' },
      { token: 'markup.italic',          foreground: 'c792ea', fontStyle: 'italic' },
      { token: 'markup.quote',           foreground: 'c3e88d', fontStyle: 'italic' },
      { token: 'markup.list',            foreground: '89ddff' },
      { token: 'markup.inline.raw',      foreground: 'f78c6c' },
      { token: 'string.link.md',         foreground: '82aaff', fontStyle: 'underline' },
    ],
    colors: {
      'editor.background':                   '#1e1e1e',
      'editor.foreground':                   '#e6edf3',
      'editor.lineHighlightBackground':      '#161b22',
      'editor.lineHighlightBorder':          '#00000000',
      'editor.selectionBackground':          '#264f78aa',
      'editor.selectionHighlightBackground': '#264f7840',
      'editor.wordHighlightBackground':      '#264f7840',
      'editor.wordHighlightStrongBackground':'#264f7870',
      'editorCursor.foreground':             '#c792ea',
      'editorLineNumber.foreground':         '#3d444d',
      'editorLineNumber.activeForeground':   '#6e7681',
      'editorIndentGuide.background1':       '#21262d',
      'editorIndentGuide.activeBackground1': '#30363d',
      'editorBracketMatch.background':       '#264f7820',
      'editorBracketMatch.border':           '#c792ea',
      'minimap.background':                  '#1e1e1e',
      'minimapSlider.background':            '#264f7840',
      'minimapSlider.hoverBackground':       '#264f7860',
      'scrollbarSlider.background':          '#30363d80',
      'scrollbarSlider.hoverBackground':     '#484f58',
      'scrollbarSlider.activeBackground':    '#6e768166',
      'editorGutter.background':             '#1e1e1e',
      'editorOverviewRuler.border':          '#21262d',
      'editorSuggestWidget.background':      '#161b22',
      'editorSuggestWidget.border':          '#30363d',
      'editorSuggestWidget.foreground':      '#e6edf3',
      'editorSuggestWidget.selectedBackground': '#1f2937',
      'editorSuggestWidget.highlightForeground': '#79c0ff',
      'editorHoverWidget.background':        '#161b22',
      'editorHoverWidget.border':            '#30363d',
      'editorError.foreground':              '#f85149',
      'editorWarning.foreground':            '#e3b341',
      'editorInfo.foreground':               '#58a6ff',
      'breadcrumb.foreground':               '#6e7681',
      'breadcrumb.activeSelectionForeground':'#e6edf3',
      'breadcrumbPicker.background':         '#161b22',
      'widget.shadow':                       '#010409cc',
    },
  })
}

// ── Inner component — React.memo prevents ALL re-renders ──────────────────────
const MonacoEditorInner: React.FC = () => {
  const containerRef  = useRef<HTMLDivElement>(null)
  const editorRef     = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const activePathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // One-time setup
    configureTypeScript()
    registerOrchTheme()

    const editor = monaco.editor.create(containerRef.current, {
      theme:      'orch-dark',
      fontSize:   13,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
      fontLigatures: true,
      lineHeight: 22,
      letterSpacing: 0.3,

      // Minimap
      minimap: { enabled: true, scale: 2, showSlider: 'mouseover', renderCharacters: true },

      // IntelliSense
      quickSuggestions:    { other: true, comments: true, strings: true },
      acceptSuggestionOnCommitCharacter: true,
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions:  'top',
      wordBasedSuggestions: 'allDocuments',
      suggest: {
        showKeywords:       true,
        showSnippets:       true,
        showClasses:        true,
        showFunctions:      true,
        showVariables:      true,
        showModules:        true,
        showProperties:     true,
        showMethods:        true,
        showConstructors:   true,
        showFields:         true,
        showInterfaces:     true,
        showOperators:      true,
        showEnumMembers:    true,
        showColors:         true,
        showFiles:          true,
        showReferences:     true,
        showTypeParameters: true,
        filterGraceful:     true,
        localityBonus:      true,
        insertMode:         'replace',
      },
      suggestFontSize:  12,
      suggestLineHeight: 20,

      // Signature help
      parameterHints: { enabled: true, cycle: true },

      // Code lens & inlay hints
      inlayHints: { enabled: 'on', fontSize: 11, padding: true },
      codeLens:   true,

      // Code folding
      folding:             true,
      foldingStrategy:     'indentation',
      foldingHighlight:    true,
      showFoldingControls: 'mouseover',

      // Bracket pair colorization
      bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
      guides: {
        bracketPairs:           'active',
        bracketPairsHorizontal: 'active',
        indentation:            true,
        highlightActiveBracketPair: true,
      },

      // Semantic tokens
      'semanticHighlighting.enabled': true,

      // Linked editing (HTML/JSX tag rename)
      linkedEditing: true,

      // Sticky scroll
      stickyScroll: { enabled: true, maxLineCount: 5 },

      // Format
      formatOnType:  true,
      formatOnPaste: true,

      // Scrolling
      scrollBeyondLastLine:    false,
      smoothScrolling:         true,
      fastScrollSensitivity:   5,
      scrollbar: {
        vertical:                'visible',
        horizontal:              'visible',
        useShadows:              false,
        verticalScrollbarSize:   8,
        horizontalScrollbarSize: 8,
        alwaysConsumeMouseWheel: false,
      },

      // Cursor
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking:             'smooth',
      cursorStyle:                'line',

      // Whitespace / gutter
      renderWhitespace:       'selection',
      renderControlCharacters: true,
      renderLineHighlight:    'all',
      lineNumbers:            'on',
      lineDecorationsWidth:   8,
      glyphMargin:            true,

      // Other UX
      wordWrap:            'off',
      tabSize:             2,
      insertSpaces:        true,
      detectIndentation:   true,
      trimAutoWhitespace:  true,
      padding:             { top: 12, bottom: 12 },
      automaticLayout:     false,
      mouseWheelZoom:      true,
      accessibilitySupport:'auto',
      colorDecorators:     true,
      occurrencesHighlight:'singleFile',
      selectionHighlight:  true,
      find: {
        addExtraSpaceOnTop:             false,
        seedSearchStringFromSelection: 'always',
      },
      hover: { enabled: true, delay: 300, above: false },
    })

    editorRef.current = editor
    useEditorStore.getState().setEditorInstance(editor)

    // ResizeObserver → relayout
    const ro = new ResizeObserver(() => editor.layout())
    ro.observe(containerRef.current!)

    // Ctrl/Cmd+S → format then save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const model = editor.getModel()
      if (!model) return
      try { await editor.getAction('editor.action.formatDocument')?.run() } catch {}
      const fp      = model.uri.fsPath
      const content = model.getValue()
      await window.orch.writeFile(fp, content)
      useEditorStore.getState().markDirty(fp, false)
    })

    // Ctrl/Cmd+Shift+P → command palette
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => {
      editor.getAction('editor.action.quickCommand')?.run()
    })

    // F12 → go to definition
    editor.addCommand(monaco.KeyCode.F12, () => {
      editor.getAction('editor.action.revealDefinition')?.run()
    })

    // F2 → rename symbol
    editor.addCommand(monaco.KeyCode.F2, () => {
      editor.getAction('editor.action.rename')?.run()
    })

    // Alt+Shift+F → format document
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      editor.getAction('editor.action.formatDocument')?.run()
    })

    // Track dirty state
    editor.onDidChangeModelContent(() => {
      const model = editor.getModel()
      if (model) useEditorStore.getState().markDirty(model.uri.fsPath, true)
    })

    // Subscribe imperatively to avoid React render cycle blocking Monaco
    const syncEditor = (state: ReturnType<typeof useEditorStore.getState>) => {
      const { activeFilePath, openFiles } = state
      if (!editorRef.current || activeFilePath === activePathRef.current) return

      activePathRef.current = activeFilePath
      if (!activeFilePath) { editor.setModel(null); return }

      const fileInfo = openFiles.find(f => f.path === activeFilePath)
      if (!fileInfo) return

      // Try cache first
      const cached = modelCache.get(activeFilePath)
      if (cached && !cached.isDisposed()) {
        editor.setModel(cached)
        return
      }

      // Load from disk
      window.orch.readFile(activeFilePath)
        .then((content: string) => {
          const m = getOrCreateModel(activeFilePath, content, fileInfo.language)
          if (activePathRef.current === activeFilePath) {
            editorRef.current?.setModel(m)
          }
        })
        .catch(() => {
          const m = getOrCreateModel(activeFilePath, '', fileInfo.language)
          if (activePathRef.current === activeFilePath) {
            editorRef.current?.setModel(m)
          }
        })
    }

    const unsub = useEditorStore.subscribe(syncEditor)
    syncEditor(useEditorStore.getState())

    return () => {
      unsub()
      ro.disconnect()
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="monaco-container"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

export const MonacoEditor = memo(MonacoEditorInner, () => true)
