import { History, List, Settings } from "lucide-react";
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "../../commons/i18n";

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

const BottomNav: React.FC = () => {
  const location = useLocation();
  const { t } = useI18n();

  const navItems: NavItem[] = [
    {
      path: "/",
      label: t("nav.recipes"),
      icon: List,
    },
    {
      path: "/history",
      label: t("nav.history"),
      icon: History,
    },
    {
      path: "/settings",
      label: t("nav.settings"),
      icon: Settings,
    },
  ];

  return (
    <div className="fixed left-0 right-0 z-40 flex justify-center px-4 pointer-events-none bottom-4">
      <nav className="flex items-center border shadow-lg pointer-events-auto bg-bg-card/70 backdrop-blur-md border-border-default/50 rounded-2xl p-1.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              title={item.label}
              aria-label={item.label}
              className={`relative flex items-center justify-center w-14 h-11 rounded-xl transition-all duration-300 ${
                isActive
                  ? "bg-accent-primary/15 text-accent-primary"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-secondary/50"
              }`}
            >
              <div className="flex flex-col items-center gap-0.5">
                <Icon
                  className={`w-5 h-5 transition-transform duration-300 ${
                    isActive ? "scale-110" : "scale-100"
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span
                  className={`text-[9px] font-bold tracking-wide transition-all duration-300 ${
                    isActive
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-2 hidden"
                  }`}
                >
                  {/* Optional label if we want it visible only when active, or remove completely for cleaner look */}
                  {/* For now let's keep it minimal and just rely on icon + color,
                      or show a small dot. Let's try just the icon centered if inactive,
                      and icon + dot if active?

                      Actually, let's go for a very clean icon-only look but with a glow.
                  */}
                </span>

                {/* Active Indicator Dot */}
                {isActive && (
                  <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-accent-primary shadow-[0_0_8px_rgba(var(--accent-primary),0.6)] animate-fade-in" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;
