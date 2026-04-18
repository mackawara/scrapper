"use client";

import { useSession, signOut } from "next-auth/react";
import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import LogoutIcon from "@mui/icons-material/Logout";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { useState } from "react";

export default function UserMenu() {
  const { data: session } = useSession();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (!session?.user) {
    return (
      <Tooltip title="Account">
        <IconButton size="small" color="inherit">
          <AccountCircleIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  const { name, email, image } = session.user;

  return (
    <>
      <Tooltip title={name ?? email ?? "Account"}>
        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small">
          <Avatar src={image ?? undefined} alt={name ?? "User"} sx={{ width: 30, height: 30 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            sx: { minWidth: 200, borderRadius: 2, mt: 1 },
          },
        }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <MenuItem disabled>
          <ListItemText
            primary={
              <Typography variant="subtitle2" fontWeight={600}>
                {name}
              </Typography>
            }
            secondary={email}
          />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => signOut({ callbackUrl: "/signin" })}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Sign out" />
        </MenuItem>
      </Menu>
    </>
  );
}
