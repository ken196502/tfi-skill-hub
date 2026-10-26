"use client";

import type Quill from "quill";
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { normalizeRichTextHtml } from "@/lib/rich-text";

import "quill/dist/quill.snow.css";

/**
 * Rich-text field backed by Quill.
 *
 * Quill is a browser-only library — it reaches for `document` while
 * initialising — so it is imported dynamically once the field is on screen
 * rather than at module scope. Nothing here runs during a server render, which
 * also means the field can sit inside a dialog that only ever opens on a click.
 *
 * The stored value is *not* Quill's `innerHTML`: that carries list markup only
 * Quill understands. Everything leaving this component goes through
 * `normalizeRichTextHtml` first — see `lib/rich-text.ts`.
 */

/** Deliberately small: headings, inline emphasis, lists, quote, code, links. */
const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["blockquote", "code-block", "link"],
  ["clean"],
];

/** Anything not listed here is dropped on input, keeping the output predictable. */
const FORMATS = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "list",
  "indent",
  "blockquote",
  "code-block",
  "link",
];

/**
 * `text/plain` that clearly carries markup — e.g. HTML source copied from a
 * code editor, which arrives without the `text/html` clipboard flavour.
 */
function looksLikeMarkup(text: string): boolean {
  return /<\/[a-z][a-z0-9-]*\s*>/i.test(text) || /<(br|hr|img)\b[^>]*\/?>/i.test(text);
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  const emittedRef = useRef<string | null>(null);
  const valueRef = useRef(value);
  const placeholderRef = useRef(placeholder);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  // The editor callbacks read the latest props through refs; the write happens
  // in an effect (never during render) and, declared before the mount effect
  // below, has already run by the time the editor is created.
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
    placeholderRef.current = placeholder;
  }, [onChange, value, placeholder]);

  useEffect(() => {
    let disposed = false;
    let created: Quill | null = null;
    let host: HTMLDivElement | null = null;
    let onPaste: ((event: ClipboardEvent) => void) | null = null;

    const emit = () => {
      const html = normalizeRichTextHtml(created?.root.innerHTML ?? "");
      emittedRef.current = html;
      onChangeRef.current(html);
    };

    void (async () => {
      try {
        const quillModule = await import("quill");
        if (disposed || !hostRef.current) return;

        host = hostRef.current;
        const editor = new quillModule.default(host, {
          theme: "snow",
          placeholder: placeholderRef.current,
          modules: { toolbar: TOOLBAR },
          formats: FORMATS,
        });
        created = editor;

        // Copied HTML *source* reaches the clipboard as plain text only, which
        // Quill would insert literally; route it through the HTML parser
        // instead so the markup renders rather than showing as tags. The
        // listener sits on the host (an ancestor of quill.root), so in the
        // capture phase it runs before Quill's own paste handler — stopping
        // the event keeps Quill from also inserting the raw text.
        onPaste = (event) => {
          const data = event.clipboardData;
          if (!data || data.getData("text/html")) return;
          const text = data.getData("text/plain");
          if (!text || !looksLikeMarkup(text)) return;
          event.preventDefault();
          event.stopPropagation();
          const range = editor.getSelection(true);
          editor.clipboard.dangerouslyPasteHTML(
            range?.index ?? editor.getLength(),
            text,
            "user",
          );
        };
        host.addEventListener("paste", onPaste, true);
        // `silent`: seeding the field is not a user edit, so it must not call
        // back into the form and mark it dirty.
        editor.clipboard.dangerouslyPasteHTML(valueRef.current ?? "", "silent");
        emittedRef.current = valueRef.current ?? "";
        editor.on("text-change", emit);

        quillRef.current = editor;
        setStatus("ready");
      } catch (error) {
        if (disposed) return;
        console.error("rich text editor could not be loaded", error);
        setStatus("unavailable");
      }
    })();

    return () => {
      disposed = true;
      if (created) created.off("text-change", emit);
      if (host && onPaste) host.removeEventListener("paste", onPaste, true);
      quillRef.current = null;
    };
  }, []);

  // Adopt a value the parent swapped in — the dialog moving to another record,
  // or a reset after saving. Skipped when the value is just an echo of what the
  // field already emitted, which is what keeps this from looping.
  useEffect(() => {
    const editor = quillRef.current;
    if (status !== "ready" || !editor) return;
    const next = value ?? "";
    if (emittedRef.current === next) return;
    if (normalizeRichTextHtml(editor.root.innerHTML) === next) {
      emittedRef.current = next;
      return;
    }
    editor.clipboard.dangerouslyPasteHTML(next, "silent");
    emittedRef.current = next;
  }, [value, status]);

  // Quill reads the placeholder only when it is constructed; follow later
  // prop changes (the dialog switching between skill and knowledge) by
  // updating the attribute the blank-state CSS reads.
  useEffect(() => {
    const editor = quillRef.current;
    if (status !== "ready" || !editor) return;
    const next = placeholder ?? "";
    if (next) editor.root.setAttribute("data-placeholder", next);
    else editor.root.removeAttribute("data-placeholder");
  }, [placeholder, status]);

  // Quill failed to load (offline chunk, blocked script): fall back to editing
  // the markup directly rather than leaving the form unusable.
  if (status === "unavailable") {
    return (
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        rows={8}
        className="font-mono text-xs"
      />
    );
  }

  return (
    <div className="rich-text-editor relative">
      <div ref={hostRef} />
      {status === "loading" ? (
        <div aria-hidden className="h-40 animate-pulse rounded-md border bg-muted/40" />
      ) : null}
    </div>
  );
}
