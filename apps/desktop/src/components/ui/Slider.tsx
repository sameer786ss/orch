import type { ComponentProps, CSSProperties } from "react";

interface SliderProps extends Omit<ComponentProps<"input">, "type" | "value" | "onChange" | "min" | "max" | "step"> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  marks?: readonly string[];
  onValueChange: (value: number) => void;
}

export function Slider({ value, min = 0, max = 100, step = 1, marks, onValueChange, className, ...props }: SliderProps) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={className ? `slider ${className}` : "slider"}>
      <input
        type="range"
        className="slider-input"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--fill": `${fill}%` } as CSSProperties}
        onChange={(e) => onValueChange(Number(e.target.value))}
        {...props}
      />
      {marks && (
        <div className="slider-marks" aria-hidden="true">
          {marks.map((mark) => (
            <span key={mark}>{mark}</span>
          ))}
        </div>
      )}
    </div>
  );
}
