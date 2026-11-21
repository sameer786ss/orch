import type { KeyboardEvent } from "react";
import { LuChevronDown } from "react-icons/lu";
import { useChatStore } from "../../lib/store";
import { Button } from "../ui/Button";
import { Menu, MenuContent, MenuControl, MenuTrigger } from "../ui/Menu";
import { Slider } from "../ui/Slider";

const EFFORTS = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
] as const;

const EFFORT_MARKS = EFFORTS.map((e) => e.label);

export function ThinkingMenu() {
  const effort = useChatStore((s) => s.thinkingEffort);
  const setEffort = useChatStore((s) => s.setThinkingEffort);
  const index = Math.max(
    0,
    EFFORTS.findIndex((e) => e.key === effort)
  );
  const label = EFFORTS[index].label;

  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    setEffort(EFFORTS[Math.min(Math.max(index + delta, 0), EFFORTS.length - 1)].key);
  };

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button className="thinking-btn" aria-label="Thinking effort">
          <span>{label}</span>
          <LuChevronDown className="chevron" />
        </Button>
      </MenuTrigger>
      <MenuContent className="menu-space" align="start" side="top">
        <MenuControl onKeyDown={step}>
          <div className="menu-control-head">
            <span>Thinking</span>
            <span>{label}</span>
          </div>
          <Slider
            aria-label="Thinking effort"
            aria-valuetext={label}
            min={0}
            max={EFFORTS.length - 1}
            value={index}
            marks={EFFORT_MARKS}
            onValueChange={(next) => setEffort(EFFORTS[next].key)}
          />
        </MenuControl>
      </MenuContent>
    </Menu>
  );
}
