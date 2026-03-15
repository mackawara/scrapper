"use client";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import HomeIcon from "@mui/icons-material/Home";
import SearchIcon from "@mui/icons-material/Search";
import Link from "next/link";
import { usePathname } from "next/navigation";
import UserMenu from "@/components/UserMenu";

export const DRAWER_WIDTH = 240;

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface ProjectShellProps {
  title: string;
  navItems: NavItem[];
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  regexMode?: boolean;
  onToggleRegexMode?: () => void;
  searchError?: string;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
}

export default function ProjectShell({
  title,
  navItems,
  search = "",
  onSearch,
  searchPlaceholder = "Search…",
  regexMode = false,
  onToggleRegexMode,
  searchError,
  sidebar,
  children,
}: ProjectShellProps) {
  const pathname = usePathname();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* Left Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            bgcolor: "background.paper",
            borderRight: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        <Toolbar sx={{ bgcolor: "primary.dark", minHeight: 64 }}>
          <Typography variant="subtitle1" fontWeight={700} color="white" noWrap>
            {title}
          </Typography>
        </Toolbar>
        <Divider />

        <List dense sx={{ pt: 1, px: 1 }}>
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={active}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  "&.Mui-selected": { bgcolor: "secondary.light", color: "primary.dark" },
                  "&.Mui-selected .MuiListItemIcon-root": { color: "primary.dark" },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ variant: "body2", fontWeight: active ? 600 : 400 }} />
              </ListItemButton>
            );
          })}
        </List>

        {sidebar && (
          <>
            <Divider sx={{ mx: 1, my: 1 }} />
            {sidebar}
          </>
        )}
      </Drawer>

      {/* Main area */}
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        {/* Top AppBar */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: "white",
            borderBottom: "1px solid",
            borderColor: "divider",
            color: "text.primary",
            zIndex: (theme) => theme.zIndex.drawer - 1,
          }}
        >
          <Toolbar sx={{ gap: 2, minHeight: 64 }}>
            {onSearch && (
              <Box sx={{ flexGrow: 1, maxWidth: 560 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    bgcolor: searchError ? "error.50" : "grey.100",
                    border: searchError ? "1px solid" : "1px solid transparent",
                    borderColor: searchError ? "error.main" : "transparent",
                    borderRadius: 2,
                    px: 1.5,
                    py: 0.5,
                  }}
                >
                  <SearchIcon sx={{ color: searchError ? "error.main" : "text.disabled", mr: 1, fontSize: 20 }} />
                  <InputBase
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    sx={{ flex: 1, fontSize: 14 }}
                  />
                  {onToggleRegexMode && (
                    <Chip
                      label=".*"
                      size="small"
                      onClick={onToggleRegexMode}
                      color={regexMode ? "primary" : "default"}
                      variant={regexMode ? "filled" : "outlined"}
                      sx={{
                        ml: 1,
                        fontFamily: "monospace",
                        fontSize: 11,
                        height: 22,
                        cursor: "pointer",
                      }}
                    />
                  )}
                </Box>
                {searchError && (
                  <Typography variant="caption" color="error" sx={{ px: 1.5 }}>
                    {searchError}
                  </Typography>
                )}
              </Box>
            )}

            <Box sx={{ flexGrow: 1 }} />

            <Tooltip title="Home">
              <IconButton component={Link} href="/" size="small" color="inherit">
                <HomeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <UserMenu />
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: "background.default" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
