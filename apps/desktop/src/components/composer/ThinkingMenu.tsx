import type { KeyboardEvent } from "react";
import { LuChevronDown } from "react-icons/lu";
import { useChatStore } from "../../lib/store";
import { Button } from "../ui/Button";
import { Menu, MenuContent, MenuControl, MenuTrigger } from "../ui/Menu";
import { Slider } from "../ui/Slider";

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ThinkingMenu() {
  const efforts = useChatStore((s) => s.selectedModel?.thinkingEfforts);
  const effort = useChatStore((s) => s.thinkingEffort);
  const setEffort = useChatStore((s) => s.setThinkingEffort);

  if (!efforts || efforts.length === 0) return null;

  const index = Math.max(0, efforts.indexOf(effort));
  const label = titleCase(efforts[index]);
  const marks = efforts.map(titleCase);

  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    setEffort(efforts[Math.min(Math.max(index + delta, 0), efforts.length - 1)]);
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
            max={efforts.length - 1}
            value={index}
            marks={marks}
            onValueChange={(next) => setEffort(efforts[next])}
          />
        </MenuControl>
      </MenuContent>
    </Menu>
  );
}
