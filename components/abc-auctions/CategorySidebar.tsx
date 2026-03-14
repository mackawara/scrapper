"use client";

import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";

export interface CategoryItem {
  name: string;
  count: number;
}

interface CategorySidebarProps {
  categories: CategoryItem[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function CategorySidebar({ categories, selected, onChange }: CategorySidebarProps) {
  const allSelected = selected.length === 0;

  function toggle(cat: string) {
    if (selected.includes(cat)) {
      onChange(selected.filter((c) => c !== cat));
    } else {
      onChange([...selected, cat]);
    }
  }

  return (
    <Box>
      <Typography variant="overline" color="text.secondary" px={2}>
        Categories
      </Typography>
      <Divider sx={{ mb: 1 }} />
      <List dense disablePadding>
        <ListItemButton selected={allSelected} onClick={() => onChange([])}>
          <Checkbox
            edge="start"
            checked={allSelected}
            disableRipple
            size="small"
            color="primary"
          />
          <ListItemText primary="All" />
        </ListItemButton>

        {categories.map(({ name, count }) => (
          <ListItemButton key={name} selected={selected.includes(name)} onClick={() => toggle(name)}>
            <Checkbox
              edge="start"
              checked={selected.includes(name)}
              disableRipple
              size="small"
              color="primary"
            />
            <ListItemText
              primary={name}
              secondary={`${count} lots`}
              primaryTypographyProps={{ variant: "body2", noWrap: true }}
              secondaryTypographyProps={{ variant: "caption" }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
