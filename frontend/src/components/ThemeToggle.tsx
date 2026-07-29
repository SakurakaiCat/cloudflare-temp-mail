import { Button } from "@cloudflare/kumo";
import { SunIcon, MoonIcon } from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "../lib/theme";

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  return (
    <Button
      shape="circle"
      variant="ghost"
      aria-label={mode === "dark" ? "切换到浅色" : "切换到深色"}
      title={mode === "dark" ? "切换到浅色" : "切换到深色"}
      onClick={toggle}
    >
      {mode === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </Button>
  );
}
