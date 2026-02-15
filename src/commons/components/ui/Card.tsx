import React from "react";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  glass?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
  hoverable?: boolean;
}

const Card: React.FC<CardProps> = ({
  children,
  className = "",
  glass = false,
  padding = "md",
  onClick,
  hoverable = false,
}) => {
  const baseStyles = "rounded-lg transition-all duration-200";
  const glassStyles = glass
    ? "glass"
    : "bg-bg-card border border-border-default";

  const paddingStyles = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  const interactiveStyles =
    onClick || hoverable
      ? "cursor-pointer hover:border-accent-primary hover:shadow-glass"
      : "";

  return (
    <div
      className={`${baseStyles} ${glassStyles} ${paddingStyles[padding]} ${interactiveStyles} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default Card;
