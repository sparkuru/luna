import type { ComponentProps } from "react";
import { Input } from "./ui/input";
export function Field({
  label,
  id,
  ...props
}: ComponentProps<typeof Input> & { label: string; id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Input id={id} {...props} />
    </div>
  );
}
