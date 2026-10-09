import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Confirm = (message: string, confirmLabel?: string) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

/** Bevestiging binnen de pagina (native `confirm()` werkt niet in elke omgeving, zoals een ingebedde weergave). */
export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

interface Pending {
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const confirm = useCallback<Confirm>((message, confirmLabel = 'Verwijderen') => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    return new Promise<boolean>((resolve) => setPending({ message, confirmLabel, resolve }));
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
    returnFocus.current?.focus?.();
  };

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
      // Focus binnen het dialoogvenster houden.
      if (e.key === 'Tab') {
        const els = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        const i = els.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        els[(i + (e.shiftKey ? els.length - 1 : 1)) % els.length]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="confirm-backdrop" onClick={() => close(false)}>
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-message" onClick={(e) => e.stopPropagation()}>
            <p id="confirm-message">{pending.message}</p>
            <div className="button-row">
              <button type="button" ref={confirmRef} className="danger-button" onClick={() => close(true)}>
                {pending.confirmLabel}
              </button>
              <button type="button" ref={cancelRef} className="secondary" onClick={() => close(false)}>
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
