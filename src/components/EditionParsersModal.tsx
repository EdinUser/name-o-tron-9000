import { EditionParser } from "../state/settings";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  parsers: EditionParser[];
  onChange: (parsers: EditionParser[]) => void;
};

export default function EditionParsersModal({ isOpen, onClose, parsers, onChange }: Props) {
  if (!isOpen) return null;

  const contentParsers = parsers.filter(p => p.category === "content");
  const technicalParsers = parsers.filter(p => p.category === "technical");

  const handleToggleParser = (parserId: string) => {
    const updatedParsers = parsers.map(parser =>
      parser.id === parserId ? { ...parser, enabled: !parser.enabled } : parser
    );
    onChange(updatedParsers);
  };

  const handleSelectAll = (category: "content" | "technical", enabled: boolean) => {
    const updatedParsers = parsers.map(parser =>
      parser.category === category ? { ...parser, enabled } : parser
    );
    onChange(updatedParsers);
  };

  const handleClose = () => {
    if (confirm("You have unsaved changes. Are you sure you want to close without saving?")) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClose} style={{ zIndex: 9999 }}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-neutral-800">
          <h2 className="text-xl font-semibold text-neutral-100">Edition Parser Settings</h2>
          <button onClick={handleClose} className="text-neutral-400 hover:text-neutral-200 transition-colors" title="Close (unsaved changes will be lost)">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-6 w-6">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          <div className="mb-4 text-sm text-neutral-300">
            Select which edition parsers to use when detecting editions from filenames.
            Content editions are typically preferred, while technical editions are often less desired for Plex naming.
          </div>

          {/* Content Editions */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-neutral-200">Content Editions</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSelectAll("content", true)}
                  className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                >
                  Select All
                </button>
                <button
                  onClick={() => handleSelectAll("content", false)}
                  className="px-3 py-1 text-xs bg-neutral-600 hover:bg-neutral-700 text-white rounded"
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {contentParsers.map(parser => (
                <label key={parser.id} className="flex items-center gap-2 p-2 rounded hover:bg-neutral-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={parser.enabled}
                    onChange={() => handleToggleParser(parser.id)}
                    className="h-4 w-4 accent-cyan-500"
                  />
                  <span className="text-neutral-200">{parser.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Technical Editions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-neutral-200">Technical Editions</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSelectAll("technical", true)}
                  className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                >
                  Select All
                </button>
                <button
                  onClick={() => handleSelectAll("technical", false)}
                  className="px-3 py-1 text-xs bg-neutral-600 hover:bg-neutral-700 text-white rounded"
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {technicalParsers.map(parser => (
                <label key={parser.id} className="flex items-center gap-2 p-2 rounded hover:bg-neutral-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={parser.enabled}
                    onChange={() => handleToggleParser(parser.id)}
                    className="h-4 w-4 accent-cyan-500"
                  />
                  <span className="text-neutral-200">{parser.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 border-t border-neutral-800">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-cyan-500 text-neutral-900 hover:bg-cyan-400 rounded"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
