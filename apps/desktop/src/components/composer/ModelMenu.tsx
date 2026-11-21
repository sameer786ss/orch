import { LuChevronDown } from "react-icons/lu";
import { useChatStore } from "../../lib/store";
import { Button } from "../ui/Button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";

export function ModelMenu() {
  const models = useChatStore((s) => s.models);
  const selected = useChatStore((s) => s.selectedModel);
  const setModel = useChatStore((s) => s.setSelectedModel);

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button className="model-btn" aria-label="Choose model">
          <span>{selected?.name ?? "Select model"}</span>
          <LuChevronDown className="chevron" />
        </Button>
      </MenuTrigger>
      <MenuContent align="start" side="top">
        {models.length === 0 && <MenuItem disabled>No models available</MenuItem>}
        {models.map((model) => (
          <MenuItem key={model.key} selected={model.key === selected?.key} onSelect={() => setModel(model.key)}>
            <span className="row-label">{model.name}</span>
            {model.badge && (
              <span className="row-end">
                <span className="badge">{model.badge}</span>
              </span>
            )}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
