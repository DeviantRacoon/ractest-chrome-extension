export type ThemeMode = "dark" | "light";

type ThemeTokens = Record<string, string>;

const DARK_TOKENS: ThemeTokens = {
  "--bg-main": "2 6 23",
  "--bg-card": "15 23 42",
  "--bg-hover": "51 65 85",
  "--bg-secondary": "30 41 59",
  "--text-primary": "248 250 252",
  "--text-secondary": "148 163 184",
  "--text-muted": "100 116 139",
  "--border-default": "30 41 59",
  "--border-focus": "16 185 129",
  "--accent-primary": "16 185 129",
  "--accent-hover": "5 150 105",
  "--accent-light": "52 211 153",
  "--status-success": "16 185 129",
  "--status-error": "239 68 68",
  "--status-warning": "245 158 11",
  "--status-info": "59 130 246",
};

const LIGHT_TOKENS: ThemeTokens = {
  "--bg-main": "248 250 252",
  "--bg-card": "255 255 255",
  "--bg-hover": "241 245 249",
  "--bg-secondary": "241 245 249",
  "--text-primary": "15 23 42",
  "--text-secondary": "71 85 105",
  "--text-muted": "100 116 139",
  "--border-default": "226 232 240",
  "--border-focus": "16 185 129",
  "--accent-primary": "16 185 129",
  "--accent-hover": "5 150 105",
  "--accent-light": "52 211 153",
  "--status-success": "16 185 129",
  "--status-error": "239 68 68",
  "--status-warning": "245 158 11",
  "--status-info": "59 130 246",
};

export const applyThemeToDocument = (theme: ThemeMode): void => {
  const root = document.documentElement;
  const body = document.body;
  const light = theme === "light";

  root.classList.toggle("light", light);
  body.classList.toggle("light", light);
  root.setAttribute("data-theme", theme);
  body.setAttribute("data-theme", theme);

  const tokens = light ? LIGHT_TOKENS : DARK_TOKENS;
  Object.entries(tokens).forEach(([name, value]) => {
    root.style.setProperty(name, value);
    body.style.setProperty(name, value);
  });
};
