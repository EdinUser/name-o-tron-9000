import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconInfo } from "./icons";

type RiskAcknowledgementModalProps = {
  onAccept: () => void;
};

export default function RiskAcknowledgementModal({ onAccept }: RiskAcknowledgementModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [exitFailed, setExitFailed] = useState(false);

  const handleExit = async () => {
    try {
      await getCurrentWindow().close();
    } catch {
      setExitFailed(true);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="risk-acknowledgement-title"
          className="w-full max-w-2xl rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <IconInfo className="mt-0.5 h-6 w-6 flex-shrink-0 text-cyan-400" />
            <div>
              <h1 id="risk-acknowledgement-title" className="text-xl font-semibold text-neutral-100">
                File Rename Risk Acknowledgement
              </h1>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                Name-O-Tron 9000 can rename, move, and modify files in your media libraries.
                Incorrect settings, path mappings, metadata, templates, or app bugs may produce
                wrong filenames, misplaced files, failed operations, or library disruption.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-md border border-red-800 bg-red-950/40 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-red-300">
              Beta warning
            </p>
            <p className="mt-2 text-sm leading-6 text-red-100">
              This app is still beta software. Run renames on small portions of your library
              until you have confirmed the results are correct for your setup.
            </p>
          </div>

          <div className="mt-5 space-y-3 text-sm leading-6 text-neutral-300">
            <p>
              Review every preview carefully before proceeding. Keep backups of important media
              and verify your Plex library after each batch.
            </p>
            <p>
              By continuing, you acknowledge that you are responsible for your files, backups,
              Plex libraries, settings, path mappings, templates, and rename decisions.
            </p>
          </div>

          <label className="mt-5 flex items-start gap-3 rounded-md border border-neutral-700 bg-neutral-800/70 p-3 text-sm text-neutral-200">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 accent-cyan-500"
            />
            <span>
              I understand and accept responsibility for my files and media libraries.
            </span>
          </label>

          {exitFailed && (
            <p className="mt-3 rounded-md border border-yellow-800 bg-yellow-950/40 p-3 text-sm text-yellow-100">
              The app could not close this window automatically. Close the window to exit.
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-neutral-800 pt-4">
            <button
              type="button"
              onClick={handleExit}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
            >
              Exit
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={!confirmed}
              className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              I Understand and Continue
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
