import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      fullWidth = false,
      leftIcon,
      rightIcon,
      className = "",
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "px-4 py-2 bg-bg-card text-text-primary border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 placeholder:text-text-muted disabled:opacity-50 disabled:cursor-not-allowed";

    const errorStyles = error
      ? "border-status-error focus:ring-status-error focus:border-status-error"
      : "border-border-default focus:ring-accent-primary focus:border-accent-primary";

    const widthStyle = fullWidth ? "w-full" : "";
    const paddingLeft = leftIcon ? "pl-10" : "";
    const paddingRight = rightIcon ? "pr-10" : "";

    return (
      <div className={fullWidth ? "w-full" : ""}>
        {label && (
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`${baseStyles} ${errorStyles} ${widthStyle} ${paddingLeft} ${paddingRight} ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-sm text-status-error">{error}</p>}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-text-muted">{helperText}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
