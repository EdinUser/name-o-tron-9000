import React from "react";

type Option<T extends string | number> = { value: T; label: React.ReactNode };

type SelectProps<T extends string | number> = {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  className?: string;
  disabled?: boolean;
};

export default function Select<T extends string | number>({ value, onChange, options, className, disabled }: SelectProps<T>) {
  return (
    <div className={`relative inline-flex items-center ${className || ""}`}>
      <select
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const first = options[0]?.value;
          const isNumber = typeof first === "number";
          const raw = e.target.value;
          const parsed = (isNumber ? (Number(raw) as unknown as T) : (raw as unknown as T));
          onChange(parsed);
        }}
        className="appearance-none px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-cyan-600/40 hover:bg-neutral-700 pr-7 disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)} className="bg-neutral-800 text-neutral-200">
            {opt.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400">▾</span>
    </div>
  );
}


