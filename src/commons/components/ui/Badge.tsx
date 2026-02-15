import React from "react";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: "success" | "error" | "warning" | "info" | "neutral";
  size?: "sm" | "md";
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  size = "sm",
  className = "",
}) => {
  const baseStyles = "inline-flex items-center font-medium rounded-full";

  const variantStyles = {
    success:
      "bg-status-success/20 text-status-success border border-status-success/30",
    error: "bg-status-error/20 text-status-error border border-status-error/30",
    warning:
      "bg-status-warning/20 text-status-warning border border-status-warning/30",
    info: "bg-status-info/20 text-status-info border border-status-info/30",
    neutral: "bg-bg-hover text-text-secondary border border-border-default",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
  };

  return (
    <span
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
