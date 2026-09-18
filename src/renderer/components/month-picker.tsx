import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  nextMonth,
  previousMonth,
} from "../../shared/domain";
import type { AppLocale } from "../../shared/settings";
import {
  formatMonth,
  formatMonthName,
  type MessageKey,
} from "../i18n";
import { Button } from "./ui/button";

type Message = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

export function WebMonthPicker({
  month,
  locale,
  message: m,
  changeMonth,
}: {
  month: string;
  locale: AppLocale;
  message: Message;
  changeMonth(month: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => Number(month.slice(0, 4)));
  const navigatorRef = useRef<HTMLDivElement>(null);
  const selectedYear = Number(month.slice(0, 4));

  useEffect(() => {
    setPickerYear(selectedYear);
  }, [selectedYear]);

  const closePicker = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      navigatorRef.current
        ?.querySelector<HTMLButtonElement>("#month-picker")
        ?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && navigatorRef.current?.contains(target)) return;
      closePicker();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePicker();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePicker, open]);

  const selectMonth = (next: string) => {
    changeMonth(next);
    closePicker();
  };

  return (
    <div
      ref={navigatorRef}
      className="month-controls month-navigator"
      aria-label={m("monthNavigation")}
    >
      <Button
        id="previous-month"
        type="button"
        variant="outline"
        aria-label={m("previousMonth")}
        onClick={() => changeMonth(previousMonth(month))}
      >
        <ChevronLeft className="month-control-icon" aria-hidden="true" />
        <span className="month-control-label">{m("previousMonth")}</span>
      </Button>
      <div className="month-picker">
        <button
          id="month-picker"
          type="button"
          className="month-picker-trigger"
          data-month={month}
          aria-label={m("monthPickerButton", {
            month: formatMonth(locale, month),
          })}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="month-picker-panel"
          onClick={() => {
            setPickerYear(selectedYear);
            setOpen((current) => !current);
          }}
        >
          <span>{formatMonth(locale, month)}</span>
        </button>
        {open && (
          <div
            id="month-picker-panel"
            className="month-picker-panel"
            role="dialog"
            aria-label={m("monthPicker")}
          >
            <div className="month-picker-year-navigation">
              <Button
                type="button"
                variant="ghost"
                className="month-picker-year-button"
                aria-label={m("previousYear")}
                disabled={pickerYear <= 1900}
                onClick={() =>
                  setPickerYear((year) => Math.max(1900, year - 1))
                }
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span className="month-picker-year" aria-live="polite">
                {pickerYear}
              </span>
              <Button
                type="button"
                variant="ghost"
                className="month-picker-year-button"
                aria-label={m("nextYear")}
                disabled={pickerYear >= 9999}
                onClick={() =>
                  setPickerYear((year) => Math.min(9999, year + 1))
                }
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
            <div
              className="month-picker-options"
              role="group"
              aria-label={m("monthChoices", { year: pickerYear })}
            >
              {Array.from({ length: 12 }, (_, index) => {
                const value = `${pickerYear}-${String(index + 1).padStart(2, "0")}`;
                return (
                  <button
                    key={value}
                    type="button"
                    className="month-picker-option"
                    data-month={value}
                    aria-label={formatMonth(locale, value)}
                    aria-pressed={value === month}
                    onClick={() => selectMonth(value)}
                  >
                    {formatMonthName(locale, value)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <Button
        id="next-month"
        type="button"
        variant="outline"
        aria-label={m("nextMonth")}
        onClick={() => changeMonth(nextMonth(month))}
      >
        <span className="month-control-label">{m("nextMonth")}</span>
        <ChevronRight className="month-control-icon" aria-hidden="true" />
      </Button>
    </div>
  );
}
