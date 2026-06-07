const variants = {
  primary: "button--primary",
  secondary: "button--secondary",
  ghost: "button--ghost",
  danger: "button--danger"
};

const sizes = {
  sm: "button--sm",
  md: "",
  lg: "button--lg"
};

export function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const classes = [
    "button",
    variants[variant] || variants.primary,
    sizes[size] || "",
    className
  ].filter(Boolean).join(" ");

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
