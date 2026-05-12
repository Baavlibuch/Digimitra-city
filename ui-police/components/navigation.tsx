"use client"

import { Button } from "@/components/ui/button"
import { LayoutDashboard, Map, AlertTriangle, Monitor, Settings, Brain, LogOut } from "lucide-react"

interface NavigationProps {
  activeSection: string
  onSectionChange: (section: string) => void
  onSignOut: () => void
  isSigningOut?: boolean
}

export function Navigation({ activeSection, onSectionChange, onSignOut, isSigningOut = false }: NavigationProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "map", label: "Map View", icon: Map },
    { id: "search", label: "AI Operator", icon: Brain }, // Changed icon to Brain for thinking model
    { id: "events", label: "Events & Alerts", icon: AlertTriangle },
    { id: "feeds", label: "Live Feeds", icon: Monitor },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  return (
    <nav className="border-b border-slate-700/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
              <span className="text-lg font-bold text-white">DM</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Digimitra</h1>
              <p className="text-xs text-muted-foreground -mt-1">AI Surveillance</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={activeSection === item.id ? "default" : "ghost"}
                size="sm"
                onClick={() => onSectionChange(item.id)}
                className={`flex items-center gap-2 ${
                  activeSection === item.id ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "hover:bg-muted/50"
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden md:inline">{item.label}</span>
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              disabled={isSigningOut}
              className="flex items-center gap-2 hover:bg-muted/50"
            >
              {isSigningOut ? (
                <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              <span className="hidden md:inline">{isSigningOut ? "Signing Out..." : "Sign Out"}</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
