import React from "react";

type RadioOption<T extends string | number> = { value: T; label: React.ReactNode };

type RadioProps<T extends string | number> = {
  value: T;
  onChange?: (value: T) => void; // For new usage
  setValue?: (value: T) => void; // For backward compatibility
  options?: RadioOption<T>[]; // For new usage
  opts?: { value: T; label: string }[]; // For backward compatibility
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  // When true, renders a segmented toggle-like control instead of dots
  segmented?: boolean;
};

export default function Radio<T extends string | number>({
  value,
  onChange,
  setValue,
  options,
  opts,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  segmented = false
}: RadioProps<T>) {
  // Handle backward compatibility - if opts is provided, convert to options
  const radioOptions = options || (opts ? opts.map(opt => ({ value: opt.value, label: opt.label })) : []);

  // Safety check - if no options provided, render nothing
  if (radioOptions.length === 0) {
    console.warn("Radio component: No options provided");
    return null;
  }

  // Use either onChange or setValue (setValue takes precedence for backward compatibility)
  const changeHandler = onChange || setValue;

  const handleChange = (newValue: T) => {
    if (!disabled && changeHandler) {
      changeHandler(newValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, optionValue: T) => {
    if (disabled) return;

    switch (e.key) {
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        const currentIndex = radioOptions.findIndex(opt => opt.value === value);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : radioOptions.length - 1;
        if (changeHandler) changeHandler(radioOptions[prevIndex].value);
        break;
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        const nextIndex = radioOptions.findIndex(opt => opt.value === value);
        const next = nextIndex < radioOptions.length - 1 ? nextIndex + 1 : 0;
        if (changeHandler) changeHandler(radioOptions[next].value);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        handleChange(optionValue);
        break;
    }
  };

  if (segmented) {
    // Toggle-like segmented control
    return (
      <div
        className={`inline-flex rounded-full bg-neutral-800 border border-neutral-700 p-0.5 ${disabled ? "opacity-50" : ""} ${className}`}
        role="radiogroup"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
      >
        {radioOptions.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled}
              onClick={() => handleChange(option.value)}
              onKeyDown={(e) => handleKeyDown(e as unknown as React.KeyboardEvent, option.value)}
              className={`
                px-3 py-1 text-sm rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-600/40
                ${isActive ? "bg-cyan-500 text-neutral-900" : "text-neutral-300 hover:bg-neutral-700"}
              `}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 ${className}`}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    >
      {radioOptions.map((option) => (
        <label
          key={String(option.value)}
          className={`
            inline-flex items-center gap-2 cursor-pointer transition-opacity
            ${disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"}
          `}
        >
          <div className="relative">
            <input
              type="radio"
              value={String(option.value)}
              checked={value === option.value}
              onChange={() => handleChange(option.value)}
              disabled={disabled}
              className="sr-only" // Hide native radio input
              onKeyDown={(e) => handleKeyDown(e, option.value)}
            />
            <div
              className={`
                w-4 h-4 rounded-full border-2 transition-all duration-200 flex items-center justify-center ring-2 ring-transparent focus-within:ring-cyan-600/40
                ${value === option.value
                  ? "border-cyan-500 bg-cyan-500 shadow-sm"
                  : "border-neutral-600 bg-transparent hover:border-neutral-500"
                }
                ${disabled ? "opacity-50" : ""}
              `}
            >
              {value === option.value && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>
          </div>
          <span className="text-neutral-200 select-none">{option.label}</span>
        </label>
      ))}
    </div>
  );
}
