"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Menu,
  Newspaper,
  Trophy,
  Bookmark,
  Mic,
  GraduationCap,
  X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon?: typeof Newspaper;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Papers", icon: Newspaper },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/library", label: "Library", icon: Bookmark },
  { href: "/meetings", label: "Meetings", icon: Mic },
  { href: "/learn", label: "Learn", icon: GraduationCap },
];

const DISCOVER: NavItem[] = [
  { href: "/whats-new", label: "What's new" },
  { href: "/influential", label: "Influential" },
  { href: "/gaps", label: "Coverage gaps" },
  { href: "/categories", label: "Categories" },
  { href: "/institutions", label: "Institutions" },
  { href: "/timeline", label: "Timeline" },
  { href: "/map", label: "Map" },
];

const TOOLS: NavItem[] = [
  { href: "/compare", label: "Compare" },
  { href: "/upload", label: "Upload" },
  { href: "/review", label: "Review queue" },
  { href: "/settings", label: "Ranking weights" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HeaderNav() {
  const pathname = usePathname() ?? "/";
  const [openMenu, setOpenMenu] = useState<"discover" | "tools" | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  // Close dropdowns on outside click or Escape.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setDrawerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Close everything on route change.
  useEffect(() => {
    setOpenMenu(null);
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <nav
      ref={rootRef}
      className="ml-auto flex items-center gap-1 text-sm"
      aria-label="Primary"
    >
      {/* Desktop primary links */}
      <ul className="hidden items-center gap-0.5 lg:flex">
        {PRIMARY.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                {label}
              </Link>
            </li>
          );
        })}

        <Dropdown
          label="Discover"
          isOpen={openMenu === "discover"}
          onToggle={() => setOpenMenu(openMenu === "discover" ? null : "discover")}
          items={DISCOVER}
          pathname={pathname}
        />
        <Dropdown
          label="Tools"
          isOpen={openMenu === "tools"}
          onToggle={() => setOpenMenu(openMenu === "tools" ? null : "tools")}
          items={TOOLS}
          pathname={pathname}
        />
      </ul>

      {/* Mobile / tablet hamburger */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-expanded={drawerOpen}
        aria-controls="nav-drawer"
        aria-label="Open navigation menu"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 lg:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          "hover:bg-muted",
        )}
      >
        <Menu className="h-4 w-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">Menu</span>
      </button>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
        >
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            id="nav-drawer"
            className="absolute right-0 top-0 h-full w-72 overflow-y-auto border-l bg-background p-4 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold tracking-tight">Navigate</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <XIcon className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <DrawerSection label="Primary" items={PRIMARY} pathname={pathname} />
            <DrawerSection label="Discover" items={DISCOVER} pathname={pathname} />
            <DrawerSection label="Tools" items={TOOLS} pathname={pathname} />
            <DrawerSection
              label="More"
              items={[{ href: "/about", label: "About" }]}
              pathname={pathname}
            />
          </div>
        </div>
      )}
    </nav>
  );
}

function Dropdown({
  label,
  isOpen,
  onToggle,
  items,
  pathname,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  items: NavItem[];
  pathname: string;
}) {
  const anyActive = items.some((it) => isActive(pathname, it.href));
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          isOpen || anyActive
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {label}
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 min-w-[12rem] overflow-hidden rounded-lg border bg-background shadow-lg"
        >
          <ul className="py-1">
            {items.map(({ href, label: itemLabel }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    role="menuitem"
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block px-3 py-1.5 text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:bg-muted",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {itemLabel}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}

function DrawerSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      <ul className="space-y-0.5">
        {items.map(({ href, label: itemLabel, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                {itemLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
