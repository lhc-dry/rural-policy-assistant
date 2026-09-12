import type { ButtonHTMLAttributes, ReactNode } from "react";
export function IconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      title={label}
      className={`icon-button ${className}`}
    >
      {children}
    </button>
  );
}
