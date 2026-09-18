import { useRef, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import { Input } from "./ui/input";

/**
 * Keep date inputs keyboard-editable while making a successful native picker
 * call the primary pointer interaction for the whole labelled field.
 */
export function DateField({
  label,
  id,
  ...props
}: ComponentProps<typeof Input> & { label: string; id: string }) {
  const pickerOpenedOnPointerDown = useRef(false);

  const openPicker = (event: ReactPointerEvent<HTMLDivElement>) => {
    pickerOpenedOnPointerDown.current = false;
    if (event.button !== 0) return;
    const input = event.currentTarget.querySelector<HTMLInputElement>(
      'input[type="date"]',
    );
    if (input === null || input.disabled) return;
    const showPicker = (
      input as HTMLInputElement & { showPicker?: () => void }
    ).showPicker;
    if (typeof showPicker !== "function") return;
    try {
      showPicker.call(input);
      pickerOpenedOnPointerDown.current = true;
      // Once showPicker succeeds, prevent segment selection from replacing the
      // native calendar interaction. Missing/rejected APIs keep the fallback.
      event.preventDefault();
    } catch {
      input.focus({ preventScroll: true });
    }
  };

  return (
    <div
      className="field date-picker-field"
      onPointerDownCapture={openPicker}
      onClickCapture={(event) => {
        if (!pickerOpenedOnPointerDown.current) return;
        event.preventDefault();
        pickerOpenedOnPointerDown.current = false;
      }}
    >
      <label htmlFor={id}>{label}</label>
      <Input id={id} {...props} />
    </div>
  );
}

export function Field({
  label,
  id,
  ...props
}: ComponentProps<typeof Input> & { label: string; id: string }) {
  if (props.type === "date") return <DateField label={label} id={id} {...props} />;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Input id={id} {...props} />
    </div>
  );
}
