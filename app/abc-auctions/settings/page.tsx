"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import SettingsIcon from "@mui/icons-material/Settings";
import CategoryIcon from "@mui/icons-material/Category";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import GridViewIcon from "@mui/icons-material/GridView";
import VisibilityIcon from "@mui/icons-material/Visibility";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import ProjectShell, { NavItem } from "@/components/ProjectShell";
import TokenAuthDialog from "@/components/abc-auctions/TokenAuthDialog";

const NAV_ITEMS: NavItem[] = [
  { label: "Browse", href: "/abc-auctions", icon: <GridViewIcon fontSize="small" /> },
  {
    label: "Categories",
    href: "/abc-auctions/categories",
    icon: <CategoryIcon fontSize="small" />,
  },
  {
    label: "Watch List",
    href: "/abc-auctions/watchlist",
    icon: <VisibilityIcon fontSize="small" />,
  },
  {
    label: "Bids",
    href: "/abc-auctions/bids",
    icon: <LocalFireDepartmentIcon fontSize="small" />,
  },
  {
    label: "Wish List",
    href: "/abc-auctions/wishlist",
    icon: <FavoriteBorderIcon fontSize="small" />,
  },
  {
    label: "Settings",
    href: "/abc-auctions/settings",
    icon: <SettingsIcon fontSize="small" />,
  },
];

export default function SettingsPage() {
  return (
    <ProjectShell
      title="ABC Auctions"
      navItems={NAV_ITEMS}
      search=""
      onSearch={() => {}}
    >
      <Stack spacing={4}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <SettingsIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>
            Settings
          </Typography>
        </Stack>

        <TokenAuthDialog isModal={false} />
      </Stack>
    </ProjectShell>
  );
}
