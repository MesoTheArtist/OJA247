import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

// App-wide replacement for the browser's window.confirm / window.alert.
//
//   const { confirm, notify } = useDialog();
//   if (!(await confirm({ title: "Delete product?", message: "...", tone: "danger" }))) return;
//   await notify({ title: "Couldn't save", message: err.message, tone: "error" });
//   const reason = await prompt({ title: "Reject?", message: "Why?", multiline: true });
//   // reason is the typed text (maybe ""), or null if the person cancelled
//
// Both return promises, so call sites read like the native versions with an
// `await` added. Dialogs queue up if several are requested at once.

const DialogContext = createContext(null);

const TONES = {
  default: { icon: Info, iconClass: "text-green-600 bg-green-50", button: "bg-green-600 hover:bg-green-700" },
  success: { icon: CheckCircle2, iconClass: "text-green-600 bg-green-50", button: "bg-green-600 hover:bg-green-700" },
  error: { icon: XCircle, iconClass: "text-red-500 bg-red-50", button: "bg-gray-900 hover:bg-black" },
  danger: { icon: AlertTriangle, iconClass: "text-red-500 bg-red-50", button: "bg-red-600 hover:bg-red-700" },
};

export function DialogProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const current = queue[0] || null;
  const idRef = useRef(0);

  const enqueue = useCallback(
    (spec) =>
      new Promise((resolve) => {
        idRef.current += 1;
        setQueue((q) => [...q, { id: idRef.current, ...spec, resolve }]);
      }),
    []
  );

  const confirm = useCallback(
    (options = {}) => enqueue({ kind: "confirm", tone: "default", ...options }),
    [enqueue]
  );
  const notify = useCallback(
    (options = {}) => enqueue({ kind: "notify", tone: "default", ...options }),
    [enqueue]
  );

  const prompt = useCallback(
    (options = {}) => enqueue({ kind: "prompt", tone: "default", ...options }),
    [enqueue]
  );

  const close = useCallback((value) => {
    setQueue((q) => {
      if (q[0]) q[0].resolve(value);
      return q.slice(1);
    });
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, notify, prompt }}>
      {children}
      {current && <DialogView key={current.id} dialog={current} onClose={close} />}
    </DialogContext.Provider>
  );
}

function DialogView({ dialog, onClose }) {
  const { kind, tone, title, message, confirmLabel, cancelLabel, placeholder, defaultValue, multiline } = dialog;
  const style = TONES[tone] || TONES.default;
  const Icon = style.icon;
  const isConfirm = kind === "confirm";
  const isPrompt = kind === "prompt";
  const hasCancel = isConfirm || isPrompt;
  const [value, setValue] = useState(defaultValue || "");
  const inputRef = useRef(null);
  const primaryRef = useRef(null);
  const cancelRef = useRef(null);
  const previouslyFocused = useRef(null);

  // The thing to dismiss with: false for a confirm, null for a prompt (so the
  // caller can tell "cancelled" from "typed nothing"), undefined for a notice.
  const dismissValue = isConfirm ? false : isPrompt ? null : undefined;

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    // Destructive confirms start on Cancel so Enter can't delete by accident.
    if (isPrompt) inputRef.current?.focus();
    else (tone === "danger" && cancelRef.current ? cancelRef.current : primaryRef.current)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(dismissValue);
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(dismissValue);
      }}
    >
      <div
        role={isConfirm ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${style.iconClass}`}>
            <Icon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="dialog-title" className="text-base font-bold text-gray-900 break-words">
              {title || (isConfirm ? "Are you sure?" : isPrompt ? "Enter a value" : "Notice")}
            </h2>
            {message && (
              <p id="dialog-message" className="mt-1.5 text-sm text-gray-600 whitespace-pre-line break-words">
                {message}
              </p>
            )}
          </div>
        </div>

        {isPrompt && (
          <div className="mt-4">
            {multiline ? (
              <textarea
                ref={inputRef}
                rows={3}
                value={value}
                placeholder={placeholder}
                aria-labelledby="dialog-title"
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onClose(value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={value}
                placeholder={placeholder}
                aria-labelledby="dialog-title"
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onClose(value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          {hasCancel && (
            <button
              ref={cancelRef}
              type="button"
              onClick={() => onClose(dismissValue)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition"
            >
              {cancelLabel || "Cancel"}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={() => onClose(isConfirm ? true : isPrompt ? value : undefined)}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-white font-semibold transition ${style.button}`}
          >
            {confirmLabel || (isConfirm ? "Confirm" : isPrompt ? "Submit" : "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Falls back to the native dialogs if a component is ever rendered outside the
// provider (a test, a stray route), so nothing silently does nothing.
const nativeFallback = {
  confirm: async ({ title, message } = {}) => window.confirm([title, message].filter(Boolean).join("\n\n")),
  notify: async ({ title, message } = {}) => {
    window.alert([title, message].filter(Boolean).join("\n\n"));
  },
  prompt: async ({ title, message, defaultValue } = {}) =>
    window.prompt([title, message].filter(Boolean).join("\n\n"), defaultValue || ""),
};

export function useDialog() {
  return useContext(DialogContext) || nativeFallback;
}