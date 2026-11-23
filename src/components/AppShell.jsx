import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  Layers,
  Sparkles,
  Wand2,
  Wrench,
  Printer,
  Radio,
  History,
  Coins,
  Settings2,
  FilePlus2,
  FolderOpen,
  Save,
  Upload,
  Download,
  Undo2,
  Redo2,
  Scissors,
  Send,
} from "lucide-react";
import PrintPilotLogo from "@/components/PrintPilotLogo";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Prepare", icon: Boxes },
  { to: "/preview", label: "Preview", icon: Layers },
  { to: "/optimize", label: "AI Optimize", icon: Wand2 },
  { to: "/ai", label: "AI Assistant", icon: Sparkles },
  { to: "/tools", label: "Model Tools", icon: Wrench },
  { to: "/printers", label: "Printers & Filament", icon: Printer },
  { to: "/device", label: "Device", icon: Radio },
  { to: "/history", label: "Print History", icon: History },
  { to: "/credits", label: "AI Credits", icon: Coins },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

export function ToolbarButton({ icon: Icon, label, onClick, disabled, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "tool-btn",
        primary &&
          "border-primary/40 bg-primary/15 text-primary hover:border-primary/60 hover:bg-primary/25 hover:text-primary"
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

export default function AppShell({
  children,
  right,
  bottom,
  actions = {},
  status,
  title,
  subtitle,
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const a = actions;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="hidden w-[212px] shrink-0 flex-col border-r border-border/70 bg-sidebar/80 md:flex">
        <div className="px-4 pb-4 pt-5">
          <Link to="/">
            <PrintPilotLogo withWordmark />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 pb-4">
          {NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn("nav-item", active && "nav-item-active")}
              >
                <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/70 px-3.5 py-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
            Plate
          </div>
          <div className="mt-1 truncate font-mono text-[11.5px] text-muted-foreground">
            {status?.plateLabel || "Plate 1"}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[54px] shrink-0 items-center gap-1 border-b border-border/70 bg-background/60 px-3 backdrop-blur">
          <ToolbarButton icon={FilePlus2} label="New" onClick={a.onNew} />
          <ToolbarButton icon={FolderOpen} label="Open" onClick={a.onOpen} />
          <ToolbarButton icon={Save} label="Save" onClick={a.onSave} />
          <div className="mx-1 h-5 w-px bg-border/80" />
          <ToolbarButton icon={Upload} label="Import Model" onClick={a.onImport} />
          <ToolbarButton icon={Download} label="Export" onClick={a.onExport} />
          <div className="mx-1 h-5 w-px bg-border/80" />
          <ToolbarButton icon={Undo2} label="Undo" onClick={a.onUndo} disabled={!a.canUndo} />
          <ToolbarButton icon={Redo2} label="Redo" onClick={a.onRedo} disabled={!a.canRedo} />
          <div className="mx-1 h-5 w-px bg-border/80" />
          <ToolbarButton icon={Scissors} label="Slice Plate" onClick={a.onSlice} primary />
          <ToolbarButton icon={Send} label="Send to Printer" onClick={a.onSend} disabled={!a.canSend} />
          <div className="ml-auto flex items-center gap-3">
            {status?.printer && (
              <div className="hidden items-center gap-2 rounded-full border border-border/80 bg-secondary/50 px-3 py-1.5 text-[11.5px] text-muted-foreground lg:flex">
                <Printer className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
                <span className="max-w-[160px] truncate">{status.printer}</span>
              </div>
            )}
            {title && (
              <div className="hidden text-right xl:block">
                <div className="font-heading text-[12.5px] font-semibold leading-tight text-foreground">
                  {title}
                </div>
                {subtitle && (
                  <div className="text-[10.5px] leading-tight text-muted-foreground">{subtitle}</div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
          {right && (
            <aside className="hidden w-[318px] shrink-0 overflow-y-auto border-l border-border/70 bg-card/30 p-3 lg:block">
              {right}
            </aside>
          )}
        </div>

        <footer className="shrink-0 border-t border-border/70 bg-card/40">
          {bottom || (
            <div className="flex h-9 items-center gap-4 px-4 text-[11.5px] text-muted-foreground">
              <span>Ready</span>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}