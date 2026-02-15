import { ChevronDown } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  leftIcon?: React.ReactNode;
  className?: string;
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  fullWidth = false,
  className = "",
  options,
  value,
  onChange,
  leftIcon,
  placeholder = "Select option...",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  const baseStyles =
    "px-4 py-2 bg-bg-card text-text-primary border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 flex items-center justify-between cursor-pointer";

  const errorStyles = error
    ? "border-status-error focus:ring-status-error focus:border-status-error"
    : "border-border-default hover:border-accent-primary/50 focus:ring-accent-primary focus:border-accent-primary";

  const widthStyle = fullWidth ? "w-full" : "w-auto";
  const paddingLeft = leftIcon ? "pl-10" : "";

  return (
    <div className={`relative ${fullWidth ? "w-full" : ""}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary mb-2">
          {label}
        </label>
      )}

      <div className="relative">
        <div
          className={`${baseStyles} ${errorStyles} ${widthStyle} ${paddingLeft} ${className}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {leftIcon}
            </div>
          )}

          <div className="flex items-center gap-2 truncate">
            {selectedOption ? (
              <>
                {selectedOption.icon && (
                  <span className="text-text-secondary">
                    {selectedOption.icon}
                  </span>
                )}
                <span className="text-text-primary">
                  {selectedOption.label}
                </span>
              </>
            ) : (
              <span className="text-text-muted">{placeholder}</span>
            )}
          </div>

          <ChevronDown
            className={`w-4 h-4 text-text-muted transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-bg-card border border-border-default rounded-lg shadow-lg animate-fade-in py-1 max-h-60 overflow-auto">
            {options.map((opt) => (
              <div
                key={opt.value}
                className={`
                  px-4 py-2.5 flex items-center gap-2 cursor-pointer transition-colors
                  ${
                    opt.value === value
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-text-primary hover:bg-bg-secondary"
                  }
                `}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.icon && (
                  <span
                    className={
                      opt.value === value
                        ? "text-accent-primary"
                        : "text-text-muted"
                    }
                  >
                    {opt.icon}
                  </span>
                )}
                <span className="text-sm">{opt.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-1.5 text-sm text-status-error">{error}</p>}
      {helperText && !error && (
        <p className="mt-1.5 text-sm text-text-muted">{helperText}</p>
      )}
    </div>
  );
};
