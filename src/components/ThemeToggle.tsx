import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
      title="Toggle theme"
    >
      <span className="relative h-4 w-4">
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0 absolute inset-0" />
        <Moon className="h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100 absolute inset-0" />
      </span>
      <span className="dark:hidden">Light Mode</span>
      <span className="hidden dark:inline">Dark Mode</span>
    </button>
  );
}
