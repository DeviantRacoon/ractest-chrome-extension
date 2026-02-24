import {
  BarChart2,
  Briefcase,
  Bug,
  FileText,
  Folder,
  Gamepad2,
  Globe,
  Home,
  Key,
  Lightbulb,
  Lock,
  type LucideIcon,
  Mail,
  Rocket,
  Settings,
  ShoppingCart,
  Smartphone,
  Star,
  Target,
  TestTube,
  Zap,
} from "lucide-react";

export const FOLDER_ICON_MAP: Record<string, LucideIcon> = {
  folder: Folder,
  globe: Globe,
  key: Key,
  cart: ShoppingCart,
  testtube: TestTube,
  briefcase: Briefcase,
  gamepad: Gamepad2,
  chart: BarChart2,
  phone: Smartphone,
  mail: Mail,
  home: Home,
  target: Target,
  settings: Settings,
  lock: Lock,
  file: FileText,
  rocket: Rocket,
  bulb: Lightbulb,
  star: Star,
  zap: Zap,
  bug: Bug,
};

export const FOLDER_ICON_KEYS = Object.keys(FOLDER_ICON_MAP) as Array<
  keyof typeof FOLDER_ICON_MAP
>;

export const DEFAULT_FOLDER_ICON = "folder";
