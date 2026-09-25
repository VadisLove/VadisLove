import type { ButtonHTMLAttributes } from "react";
import styles from "./button.module.css";

type ButtonVariant = "primary" | "secondary" | "danger" | "success";
type ButtonSize = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Gemeinsamer Button mit den Varianten der Design-Tokens aus globals.css.
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} type={type} {...props} />;
}
